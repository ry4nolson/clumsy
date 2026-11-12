use std::str::FromStr;
use std::time::Duration;

use cms::cert::{CertificateChoices, IssuerAndSerialNumber};
use cms::content_info::{CmsVersion, ContentInfo};
use cms::signed_data::{CertificateSet, EncapsulatedContentInfo, SignedData, SignerIdentifier, SignerInfo, SignerInfos};
use der::asn1::{BitString, GeneralizedTime, Int, ObjectIdentifier, OctetString, SetOfVec, UtcTime};
use der::{Any, Decode, Encode};
use security_framework::key::{GenerateKeyOptions, KeyType as SecKeyType, SecKey};
use x509_cert::attr::Attribute;
use x509_cert::certificate::{TbsCertificate, Version};
use x509_cert::crl::{CertificateList, RevokedCert, TbsCertList};
use x509_cert::ext::Extension;
use x509_cert::ext::pkix::{BasicConstraints, ExtendedKeyUsage, KeyUsage, KeyUsages};
use x509_cert::name::Name;
use x509_cert::serial_number::SerialNumber;
use x509_cert::spki::{AlgorithmIdentifierOwned, SubjectPublicKeyInfoOwned};
use x509_cert::time::{Time, Validity};
use x509_cert::Certificate;
use x509_ocsp::{BasicOcspResponse, CertStatus, OcspGeneralizedTime, OcspResponse, ResponderId, ResponseData, RevokedInfo, SingleResponse};
use x509_tsp::{MessageImprint, TimeStampResp, TspVersion, TstInfo};

use super::algorithms::{Digest, EC_PUBLIC_KEY, Padding, RSA_ENCRYPTION, Scheme};
use super::cms::ID_TST_INFO;
use super::revocation::{Pair, cert_id};

pub const YEAR: i64 = 365 * 86_400;
pub const JAN_2020: i64 = 1_577_836_800;

pub struct TestKey {
    pub key: SecKey,
    pub spki: SubjectPublicKeyInfoOwned,
    pub scheme: Scheme,
}

pub fn ec_key() -> TestKey {
    let mut options = GenerateKeyOptions::default();
    options.set_key_type(SecKeyType::ec_sec_prime_random()).set_size_in_bits(256);
    let key = SecKey::new(&options).unwrap();
    let point = key.public_key().unwrap().external_representation().unwrap().to_vec();
    let curve = Any::encode_from(&ObjectIdentifier::new_unwrap("1.2.840.10045.3.1.7")).unwrap();
    let spki = SubjectPublicKeyInfoOwned {
        algorithm: AlgorithmIdentifierOwned { oid: EC_PUBLIC_KEY, parameters: Some(curve) },
        subject_public_key: BitString::from_bytes(&point).unwrap(),
    };
    TestKey { key, spki, scheme: Scheme { padding: Padding::Ecdsa, digest: Digest::Sha256 } }
}

pub fn rsa_key(bits: u32) -> TestKey {
    let mut options = GenerateKeyOptions::default();
    options.set_key_type(SecKeyType::rsa()).set_size_in_bits(bits);
    let key = SecKey::new(&options).unwrap();
    let public = key.public_key().unwrap().external_representation().unwrap().to_vec();
    let spki = SubjectPublicKeyInfoOwned {
        algorithm: AlgorithmIdentifierOwned { oid: RSA_ENCRYPTION, parameters: Some(Any::from(der::asn1::Null)) },
        subject_public_key: BitString::from_bytes(&public).unwrap(),
    };
    TestKey { key, spki, scheme: Scheme { padding: Padding::Pkcs1, digest: Digest::Sha256 } }
}

pub fn sign_with(key: &TestKey, scheme: Scheme, data: &[u8]) -> Vec<u8> {
    key.key.create_signature(scheme.sec_algorithm(), data).unwrap()
}

pub struct Issued {
    pub cert: Certificate,
    pub der: Vec<u8>,
    pub key: TestKey,
}

pub fn time(seconds: i64) -> Time {
    Time::UtcTime(UtcTime::from_unix_duration(Duration::from_secs(seconds as u64)).unwrap())
}

fn generalized(seconds: i64) -> GeneralizedTime {
    GeneralizedTime::from_unix_duration(Duration::from_secs(seconds as u64)).unwrap()
}

fn extension<T: Encode + const_oid::AssociatedOid>(value: &T, critical: bool) -> Extension {
    Extension { extn_id: T::OID, critical, extn_value: OctetString::new(value.to_der().unwrap()).unwrap() }
}

pub enum Role {
    Authority,
    Signer,
    Timestamping,
}

pub fn issue(key: TestKey, common_name: &str, serial: u8, issuer: Option<&Issued>, validity: (i64, i64), role: Role) -> Issued {
    let subject = Name::from_str(&format!("CN={common_name},O=Clumsy Tests")).unwrap();
    let mut extensions = Vec::new();
    match role {
        Role::Authority => {
            extensions.push(extension(&BasicConstraints { ca: true, path_len_constraint: None }, true));
            extensions.push(extension(&KeyUsage(KeyUsages::KeyCertSign | KeyUsages::CRLSign), true));
        }
        Role::Signer => extensions.push(extension(&KeyUsage(KeyUsages::DigitalSignature | KeyUsages::NonRepudiation), true)),
        Role::Timestamping => {
            extensions.push(extension(&KeyUsage(KeyUsages::DigitalSignature.into()), true));
            extensions.push(extension(&ExtendedKeyUsage(vec![ObjectIdentifier::new_unwrap("1.3.6.1.5.5.7.3.8")]), true));
        }
    }
    let signing_scheme = issuer.map_or(key.scheme, |issuer| issuer.key.scheme);
    let tbs = TbsCertificate {
        version: Version::V3,
        serial_number: SerialNumber::new(&[serial]).unwrap(),
        signature: signing_scheme.identifier(),
        issuer: issuer.map_or_else(|| subject.clone(), |issuer| issuer.cert.tbs_certificate.subject.clone()),
        validity: Validity { not_before: time(validity.0), not_after: time(validity.1) },
        subject,
        subject_public_key_info: key.spki.clone(),
        issuer_unique_id: None,
        subject_unique_id: None,
        extensions: Some(extensions),
    };
    let tbs_der = tbs.to_der().unwrap();
    let signature = sign_with(issuer.map_or(&key, |issuer| &issuer.key), signing_scheme, &tbs_der);
    let cert = Certificate { tbs_certificate: tbs, signature_algorithm: signing_scheme.identifier(), signature: BitString::from_bytes(&signature).unwrap() };
    let der = cert.to_der().unwrap();
    Issued { cert, der, key }
}

pub fn pair<'a>(cert: &'a Issued, issuer: &'a Issued) -> Pair<'a> {
    Pair { cert: &cert.cert, issuer: &issuer.cert, issuer_der: &issuer.der }
}

fn echoed_cert_id(cert: &Issued, issuer: &Issued) -> x509_ocsp::CertId {
    let mut id = cert_id(&pair(cert, issuer), Digest::Sha1).unwrap();
    id.hash_algorithm.parameters = Some(Any::from(der::asn1::Null));
    id
}

pub fn ocsp_response(cert: &Issued, issuer: &Issued, signer: &Issued, revoked_at: Option<i64>) -> Vec<u8> {
    let status = match revoked_at {
        Some(at) => CertStatus::Revoked(RevokedInfo { revocation_time: OcspGeneralizedTime(generalized(at)), revocation_reason: None }),
        None => CertStatus::good(),
    };
    let data = ResponseData {
        version: x509_ocsp::Version::V1,
        responder_id: ResponderId::ByName(signer.cert.tbs_certificate.subject.clone()),
        produced_at: OcspGeneralizedTime(generalized(JAN_2020)),
        responses: vec![SingleResponse {
            cert_id: echoed_cert_id(cert, issuer),
            cert_status: status,
            this_update: OcspGeneralizedTime(generalized(JAN_2020)),
            next_update: None,
            single_extensions: None,
        }],
        response_extensions: None,
    };
    let signature = sign_with(&signer.key, signer.key.scheme, &data.to_der().unwrap());
    let basic = BasicOcspResponse {
        tbs_response_data: data,
        signature_algorithm: signer.key.scheme.identifier(),
        signature: BitString::from_bytes(&signature).unwrap(),
        certs: None,
    };
    OcspResponse::successful(basic).unwrap().to_der().unwrap()
}

pub fn crl(issuer: &Issued, revoked: &[(&Issued, i64)]) -> Vec<u8> {
    let entries: Vec<RevokedCert> = revoked
        .iter()
        .map(|(cert, at)| RevokedCert { serial_number: cert.cert.tbs_certificate.serial_number.clone(), revocation_date: time(*at), crl_entry_extensions: None })
        .collect();
    let tbs = TbsCertList {
        version: Version::V2,
        signature: issuer.key.scheme.identifier(),
        issuer: issuer.cert.tbs_certificate.subject.clone(),
        this_update: time(JAN_2020),
        next_update: None,
        revoked_certificates: (!entries.is_empty()).then_some(entries),
        crl_extensions: None,
    };
    let signature = sign_with(&issuer.key, issuer.key.scheme, &tbs.to_der().unwrap());
    let list = CertificateList { tbs_cert_list: tbs, signature_algorithm: issuer.key.scheme.identifier(), signature: BitString::from_bytes(&signature).unwrap() };
    list.to_der().unwrap()
}

fn attribute(oid: &str, value: Any) -> Attribute {
    Attribute { oid: ObjectIdentifier::new_unwrap(oid), values: SetOfVec::try_from(vec![value]).unwrap() }
}

pub fn timestamp_token(tsa: &Issued, imprint: &[u8], nonce: Option<&[u8]>, gen_time: i64) -> Vec<u8> {
    let info = TstInfo {
        version: TspVersion::V1,
        policy: ObjectIdentifier::new_unwrap("1.2.3.4.1"),
        message_imprint: MessageImprint {
            hash_algorithm: x509_cert::spki::AlgorithmIdentifier { oid: Digest::Sha256.oid(), parameters: None },
            hashed_message: OctetString::new(imprint).unwrap(),
        },
        serial_number: Int::new(&[7]).unwrap(),
        gen_time: generalized(gen_time),
        accuracy: None,
        ordering: false,
        nonce: nonce.map(|nonce| Int::new(nonce).unwrap()),
        tsa: None,
        extensions: None,
    };
    let content = info.to_der().unwrap();
    let digest = OctetString::new(Digest::Sha256.hash(&[&content])).unwrap();
    let attributes = SetOfVec::try_from(vec![
        attribute("1.2.840.113549.1.9.3", Any::encode_from(&ID_TST_INFO).unwrap()),
        attribute("1.2.840.113549.1.9.4", Any::from_der(&digest.to_der().unwrap()).unwrap()),
    ])
    .unwrap();
    let signature = sign_with(&tsa.key, tsa.key.scheme, &attributes.to_der().unwrap());
    let tbs = &tsa.cert.tbs_certificate;
    let signer = SignerInfo {
        version: CmsVersion::V1,
        sid: SignerIdentifier::IssuerAndSerialNumber(IssuerAndSerialNumber { issuer: tbs.issuer.clone(), serial_number: tbs.serial_number.clone() }),
        digest_alg: Digest::Sha256.identifier(),
        signed_attrs: Some(attributes),
        signature_algorithm: tsa.key.scheme.identifier(),
        signature: OctetString::new(signature).unwrap(),
        unsigned_attrs: None,
    };
    let econtent = Any::from_der(&OctetString::new(content).unwrap().to_der().unwrap()).unwrap();
    let signed_data = SignedData {
        version: CmsVersion::V3,
        digest_algorithms: SetOfVec::try_from(vec![Digest::Sha256.identifier()]).unwrap(),
        encap_content_info: EncapsulatedContentInfo { econtent_type: ID_TST_INFO, econtent: Some(econtent) },
        certificates: Some(CertificateSet::try_from(vec![CertificateChoices::Certificate(tsa.cert.clone())]).unwrap()),
        crls: None,
        signer_infos: SignerInfos::try_from(vec![signer]).unwrap(),
    };
    let content_info = ContentInfo { content_type: super::cms::ID_SIGNED_DATA, content: Any::encode_from(&signed_data).unwrap() };
    content_info.to_der().unwrap()
}

pub fn timestamp_reply(token: &[u8]) -> Vec<u8> {
    let reply = TimeStampResp {
        status: cmpv2::status::PkiStatusInfo { status: cmpv2::status::PkiStatus::Accepted, status_string: None, fail_info: None },
        time_stamp_token: Some(ContentInfo::from_der(token).unwrap()),
    };
    reply.to_der().unwrap()
}
