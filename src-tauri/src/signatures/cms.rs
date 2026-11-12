use cms::cert::{CertificateChoices, IssuerAndSerialNumber};
use cms::content_info::{CmsVersion, ContentInfo};
use cms::signed_data::{CertificateSet, EncapsulatedContentInfo, SignedData, SignerIdentifier, SignerInfo, SignerInfos};
use der::asn1::{ObjectIdentifier, OctetString, SetOfVec};
use der::{Any, Decode, Encode, Sequence};
use x509_cert::Certificate;
use x509_cert::attr::Attribute;
use x509_cert::ext::pkix::SubjectKeyIdentifier;
use x509_cert::spki::AlgorithmIdentifierOwned;

use super::algorithms::{Digest, Scheme, verify};
use super::certs;
use super::util::{children, read_tlv};

pub const ID_DATA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.7.1");
pub const ID_SIGNED_DATA: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.7.2");
pub const ID_TST_INFO: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.1.4");
const CONTENT_TYPE: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.3");
const MESSAGE_DIGEST: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.4");
const SIGNING_CERTIFICATE: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.2.12");
const SIGNING_CERTIFICATE_V2: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.2.47");
pub const SIGNATURE_TIMESTAMP: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.2.14");

#[derive(Clone, Debug, Eq, PartialEq, Sequence)]
struct EssCertIdV2 {
    #[asn1(optional = "true")]
    hash_algorithm: Option<AlgorithmIdentifierOwned>,
    cert_hash: OctetString,
    #[asn1(optional = "true")]
    issuer_serial: Option<Any>,
}

#[derive(Clone, Debug, Eq, PartialEq, Sequence)]
struct SigningCertificateV2 {
    certs: Vec<EssCertIdV2>,
    #[asn1(optional = "true")]
    policies: Option<Any>,
}

pub struct Cms {
    pub signed_data: SignedData,
    pub signer: SignerInfo,
    pub certificates: Vec<(Certificate, Vec<u8>)>,
    signed_attrs_der: Option<Vec<u8>>,
}

fn raw_signed_attributes(content_info: &[u8]) -> Option<Vec<u8>> {
    let (outer, _) = read_tlv(content_info)?;
    let explicit = children(outer.value)?.into_iter().find(|item| item.tag == 0xa0)?;
    let (signed_data, _) = read_tlv(explicit.value)?;
    let signer_infos = children(signed_data.value)?.into_iter().rev().find(|item| item.tag == 0x31)?;
    let (signer, _) = read_tlv(signer_infos.value)?;
    let attributes = children(signer.value)?.into_iter().skip(3).find(|item| item.tag == 0xa0)?;
    let mut raw = attributes.raw.to_vec();
    raw[0] = 0x31;
    Some(raw)
}

pub fn parse(der: &[u8]) -> Result<Cms, String> {
    let malformed = |err: der::Error| format!("The signature data couldn't be read: {err}");
    let content_info = ContentInfo::from_der(der).map_err(malformed)?;
    if content_info.content_type != ID_SIGNED_DATA {
        return Err("The signature data isn't CMS SignedData".into());
    }
    let signed_data: SignedData = content_info.content.decode_as().map_err(malformed)?;
    let mut signers = signed_data.signer_infos.0.iter();
    let signer = match (signers.next(), signers.next()) {
        (Some(signer), None) => signer.clone(),
        _ => return Err("The signature must have exactly one signer".into()),
    };
    let certificates = signed_data
        .certificates
        .iter()
        .flat_map(|set| set.0.iter())
        .filter_map(|choice| match choice {
            CertificateChoices::Certificate(certificate) => certificate.to_der().ok().map(|der| (certificate.clone(), der)),
            CertificateChoices::Other(_) => None,
        })
        .collect();
    let signed_attrs_der = if signer.signed_attrs.is_some() {
        Some(raw_signed_attributes(der).ok_or("The signed attributes couldn't be read")?)
    } else {
        None
    };
    Ok(Cms { signed_data, signer, certificates, signed_attrs_der })
}

impl Cms {
    fn attribute(&self, oid: ObjectIdentifier) -> Option<&Any> {
        self.signer.signed_attrs.as_ref()?.iter().find(|attribute| attribute.oid == oid)?.values.iter().next()
    }

    pub fn unsigned_attribute(&self, oid: ObjectIdentifier) -> Option<&Any> {
        self.signer.unsigned_attrs.as_ref()?.iter().find(|attribute| attribute.oid == oid)?.values.iter().next()
    }

    pub fn digest(&self) -> Option<Digest> {
        Digest::from_oid(&self.signer.digest_alg.oid)
    }

    pub fn scheme(&self) -> Result<Scheme, String> {
        Scheme::from_identifier(&self.signer.signature_algorithm, self.digest())
    }

    pub fn signature(&self) -> &[u8] {
        self.signer.signature.as_bytes()
    }

    pub fn econtent(&self) -> Option<Vec<u8>> {
        let content = self.signed_data.encap_content_info.econtent.as_ref()?;
        Some(content.decode_as::<OctetString>().ok()?.into_bytes())
    }

    pub fn signer_index(&self) -> Option<usize> {
        self.certificates.iter().position(|(certificate, _)| match &self.signer.sid {
            SignerIdentifier::IssuerAndSerialNumber(id) => {
                let tbs = &certificate.tbs_certificate;
                tbs.serial_number == id.serial_number && tbs.issuer.to_der().ok() == id.issuer.to_der().ok()
            }
            SignerIdentifier::SubjectKeyIdentifier(id) => certs::extension::<SubjectKeyIdentifier>(certificate).is_some_and(|ski| ski == *id),
        })
    }

    pub fn timestamp_token(&self) -> Option<Vec<u8>> {
        self.unsigned_attribute(SIGNATURE_TIMESTAMP)?.to_der().ok()
    }

    fn signing_certificate_matches(&self, certificate_der: &[u8]) -> Option<bool> {
        if let Some(value) = self.attribute(SIGNING_CERTIFICATE_V2) {
            let parsed: SigningCertificateV2 = value.decode_as().ok()?;
            let first = parsed.certs.first()?;
            let digest = first.hash_algorithm.as_ref().map_or(Some(Digest::Sha256), |algorithm| Digest::from_oid(&algorithm.oid))?;
            return Some(digest.hash(&[certificate_der]) == first.cert_hash.as_bytes());
        }
        let value = self.attribute(SIGNING_CERTIFICATE)?;
        let fields = children(value.value())?;
        let ids = children(fields.first()?.value)?;
        let id = children(ids.first()?.value)?;
        Some(Digest::Sha1.hash(&[certificate_der]) == id.first()?.value)
    }

    pub fn check(&self, content_digest: &[u8]) -> Result<usize, String> {
        let index = self.signer_index().ok_or("The signer's certificate isn't in the signature")?;
        self.digest().ok_or("The signature uses an unsupported digest algorithm")?;
        let scheme = self.scheme()?;
        let certificate_der = &self.certificates[index].1;
        let signed = match &self.signed_attrs_der {
            Some(attributes) => {
                let expected = self.attribute(MESSAGE_DIGEST).and_then(|value| value.decode_as::<OctetString>().ok());
                let expected = expected.ok_or("The signature has no message digest")?;
                if expected.as_bytes() != content_digest {
                    return Err("The document has been changed since it was signed.".into());
                }
                if self.signing_certificate_matches(certificate_der) == Some(false) {
                    return Err("The signature names a different certificate than the one it was made with.".into());
                }
                attributes.clone()
            }
            None => return Err("Signatures without signed attributes aren't supported.".into()),
        };
        if !verify(certificate_der, scheme, &signed, self.signature()) {
            return Err("The signature doesn't match the signer's certificate.".into());
        }
        Ok(index)
    }

    pub fn has_signed_attributes(&self) -> bool {
        self.signed_attrs_der.is_some()
    }

    pub fn content_type_is(&self, oid: ObjectIdentifier) -> bool {
        self.attribute(CONTENT_TYPE).and_then(|value| value.decode_as::<ObjectIdentifier>().ok()) == Some(oid)
    }
}

fn attribute(oid: ObjectIdentifier, value: Any) -> Result<Attribute, String> {
    let values = SetOfVec::try_from(vec![value]).map_err(|err| err.to_string())?;
    Ok(Attribute { oid, values })
}

fn any_of<T: Encode>(value: &T) -> Result<Any, String> {
    Any::from_der(&value.to_der().map_err(|err| err.to_string())?).map_err(|err| err.to_string())
}

pub fn signed_attributes(content_digest: &[u8], certificate_der: &[u8]) -> Result<SetOfVec<Attribute>, String> {
    let signing_certificate = SigningCertificateV2 {
        certs: vec![EssCertIdV2 {
            hash_algorithm: None,
            cert_hash: OctetString::new(Digest::Sha256.hash(&[certificate_der])).map_err(|err| err.to_string())?,
            issuer_serial: None,
        }],
        policies: None,
    };
    let digest = OctetString::new(content_digest).map_err(|err| err.to_string())?;
    let attributes = vec![
        attribute(CONTENT_TYPE, any_of(&ID_DATA)?)?,
        attribute(MESSAGE_DIGEST, any_of(&digest)?)?,
        attribute(SIGNING_CERTIFICATE_V2, any_of(&signing_certificate)?)?,
    ];
    SetOfVec::try_from(attributes).map_err(|err| err.to_string())
}

pub struct Signer<'a> {
    pub certificate: &'a Certificate,
    pub certificate_der: &'a [u8],
    pub chain: &'a [Certificate],
    pub scheme: Scheme,
}

pub fn build(signer: &Signer<'_>, content_digest: &[u8], sign: impl FnOnce(&[u8]) -> Result<Vec<u8>, String>) -> Result<Vec<u8>, String> {
    let encode = |err: der::Error| err.to_string();
    let attributes = signed_attributes(content_digest, signer.certificate_der)?;
    let signature = sign(&attributes.to_der().map_err(encode)?)?;
    let tbs = &signer.certificate.tbs_certificate;
    let signer_info = SignerInfo {
        version: CmsVersion::V1,
        sid: SignerIdentifier::IssuerAndSerialNumber(IssuerAndSerialNumber { issuer: tbs.issuer.clone(), serial_number: tbs.serial_number.clone() }),
        digest_alg: signer.scheme.digest.identifier(),
        signed_attrs: Some(attributes),
        signature_algorithm: signer.scheme.identifier(),
        signature: OctetString::new(signature).map_err(encode)?,
        unsigned_attrs: None,
    };
    let certificates: Vec<CertificateChoices> =
        std::iter::once(signer.certificate).chain(signer.chain).cloned().map(CertificateChoices::Certificate).collect();
    let signed_data = SignedData {
        version: CmsVersion::V1,
        digest_algorithms: SetOfVec::try_from(vec![signer.scheme.digest.identifier()]).map_err(encode)?,
        encap_content_info: EncapsulatedContentInfo { econtent_type: ID_DATA, econtent: None },
        certificates: Some(CertificateSet::try_from(certificates).map_err(encode)?),
        crls: None,
        signer_infos: SignerInfos::try_from(vec![signer_info]).map_err(encode)?,
    };
    let content_info = ContentInfo { content_type: ID_SIGNED_DATA, content: Any::encode_from(&signed_data).map_err(encode)? };
    content_info.to_der().map_err(encode)
}

pub fn add_timestamp(der: &[u8], token: &[u8]) -> Result<Vec<u8>, String> {
    let encode = |err: der::Error| err.to_string();
    let mut content_info = ContentInfo::from_der(der).map_err(encode)?;
    let mut signed_data: SignedData = content_info.content.decode_as().map_err(encode)?;
    let mut signers: Vec<SignerInfo> = signed_data.signer_infos.0.into_vec();
    let signer = signers.first_mut().ok_or("The signature has no signer")?;
    let token = Any::from_der(token).map_err(encode)?;
    signer.unsigned_attrs = Some(SetOfVec::try_from(vec![attribute(SIGNATURE_TIMESTAMP, token)?]).map_err(encode)?);
    signed_data.signer_infos = SignerInfos::try_from(signers).map_err(encode)?;
    content_info.content = Any::encode_from(&signed_data).map_err(encode)?;
    content_info.to_der().map_err(encode)
}
