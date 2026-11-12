use const_oid::AssociatedOid;
use der::asn1::ObjectIdentifier;
use der::{Any, Decode, Encode, Tag, Tagged};
use x509_cert::Certificate;
use x509_cert::ext::pkix::name::GeneralName;
use x509_cert::ext::pkix::{ExtendedKeyUsage, KeyUsage};
use x509_cert::name::Name;

use super::algorithms::{Digest, EC_PUBLIC_KEY, RSA_ENCRYPTION, sha256};
use super::types::{CertificateSummary, KeyType};
use super::util::{children, hex_upper, iso_time, read_tlv};

const COMMON_NAME: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.4.3");
const ORGANIZATION: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.4.10");
const EMAIL_ATTRIBUTE: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.1");
const SUBJECT_ALT_NAME: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.5.29.17");
const P256: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.2.840.10045.3.1.7");
const P384: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.132.0.34");
const P521: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.132.0.35");
const DOCUMENT_SIGNING_USAGES: [&str; 5] =
    ["2.5.29.37.0", "1.3.6.1.5.5.7.3.4", "1.2.840.113583.1.1.5", "1.3.6.1.4.1.311.10.3.12", "1.3.6.1.5.5.7.3.36"];

pub fn parse(der: &[u8]) -> Result<Certificate, String> {
    Certificate::from_der(der).map_err(|err| format!("Couldn't read a certificate: {err}"))
}

pub fn fingerprint(der: &[u8]) -> String {
    hex_upper(&sha256(der))
}

fn any_text(value: &Any) -> Option<String> {
    let bytes = value.value();
    match value.tag() {
        Tag::Utf8String => String::from_utf8(bytes.to_vec()).ok(),
        Tag::PrintableString | Tag::Ia5String | Tag::TeletexString | Tag::VisibleString => Some(bytes.iter().map(|&byte| byte as char).collect()),
        Tag::BmpString => {
            let units: Vec<u16> = bytes.as_chunks::<2>().0.iter().map(|pair| u16::from_be_bytes(*pair)).collect();
            String::from_utf16(&units).ok()
        }
        _ => None,
    }
}

fn attribute(name: &Name, oid: ObjectIdentifier) -> Option<String> {
    name.0.iter().rev().flat_map(|rdn| rdn.0.iter()).find(|entry| entry.oid == oid).and_then(|entry| any_text(&entry.value))
}

pub fn display_name(name: &Name) -> String {
    attribute(name, COMMON_NAME).or_else(|| attribute(name, ORGANIZATION)).unwrap_or_else(|| name.to_string())
}

pub fn extension<T: for<'a> Decode<'a> + AssociatedOid>(certificate: &Certificate) -> Option<T> {
    extension_by_oid(certificate, T::OID).and_then(|bytes| T::from_der(bytes).ok())
}

fn extension_by_oid(certificate: &Certificate, oid: ObjectIdentifier) -> Option<&[u8]> {
    let extensions = certificate.tbs_certificate.extensions.as_ref()?;
    extensions.iter().find(|extension| extension.extn_id == oid).map(|extension| extension.extn_value.as_bytes())
}

fn email(certificate: &Certificate) -> Option<String> {
    let alt_names = extension_by_oid(certificate, SUBJECT_ALT_NAME).and_then(|bytes| Vec::<GeneralName>::from_der(bytes).ok());
    let from_alt = alt_names.into_iter().flatten().find_map(|name| match name {
        GeneralName::Rfc822Name(address) => Some(address.to_string()),
        _ => None,
    });
    from_alt.or_else(|| attribute(&certificate.tbs_certificate.subject, EMAIL_ATTRIBUTE))
}

pub fn validity(certificate: &Certificate) -> (i64, i64) {
    let validity = &certificate.tbs_certificate.validity;
    (validity.not_before.to_unix_duration().as_secs() as i64, validity.not_after.to_unix_duration().as_secs() as i64)
}

pub fn summary(certificate: &Certificate, der: &[u8]) -> CertificateSummary {
    let tbs = &certificate.tbs_certificate;
    let (not_before, not_after) = validity(certificate);
    CertificateSummary {
        common_name: display_name(&tbs.subject),
        email: email(certificate),
        organization: attribute(&tbs.subject, ORGANIZATION),
        issuer: display_name(&tbs.issuer),
        serial: hex_upper(tbs.serial_number.as_bytes()),
        not_before: iso_time(not_before),
        not_after: iso_time(not_after),
        fingerprint: fingerprint(der),
    }
}

pub fn is_self_issued(certificate: &Certificate) -> bool {
    let tbs = &certificate.tbs_certificate;
    tbs.subject.to_der().ok() == tbs.issuer.to_der().ok()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KeyInfo {
    pub key_type: KeyType,
    pub bits: u32,
}

impl KeyInfo {
    pub fn signing_digest(self) -> Digest {
        match (self.key_type, self.bits) {
            (KeyType::Ec, 384) => Digest::Sha384,
            (KeyType::Ec, 521) => Digest::Sha512,
            _ => Digest::Sha256,
        }
    }
}

fn integer_bits(value: &[u8]) -> u32 {
    let trimmed: &[u8] = match value.iter().position(|&byte| byte != 0) {
        Some(start) => &value[start..],
        None => return 0,
    };
    (trimmed.len() as u32 - 1) * 8 + (8 - trimmed[0].leading_zeros())
}

pub fn key_info(certificate: &Certificate) -> Option<KeyInfo> {
    let spki = &certificate.tbs_certificate.subject_public_key_info;
    match spki.algorithm.oid {
        RSA_ENCRYPTION => {
            let (key, _) = read_tlv(spki.subject_public_key.raw_bytes())?;
            let modulus = children(key.value)?.first().copied()?;
            Some(KeyInfo { key_type: KeyType::Rsa, bits: integer_bits(modulus.value) })
        }
        EC_PUBLIC_KEY => {
            let curve = spki.algorithm.parameters.as_ref()?.decode_as::<ObjectIdentifier>().ok()?;
            let bits = [(P256, 256), (P384, 384), (P521, 521)].into_iter().find_map(|(known, bits)| (known == curve).then_some(bits))?;
            Some(KeyInfo { key_type: KeyType::Ec, bits })
        }
        _ => None,
    }
}

pub fn is_weak_key(certificate: &Certificate) -> bool {
    key_info(certificate).is_some_and(|key| key.key_type == KeyType::Rsa && key.bits < 2048)
}

pub fn signing_problems(certificate: &Certificate, now: i64) -> Vec<String> {
    let mut problems = Vec::new();
    let (not_before, not_after) = validity(certificate);
    if now < not_before {
        problems.push(format!("This certificate isn't valid until {}.", &iso_time(not_before)[..10]));
    }
    if now > not_after {
        problems.push(format!("This certificate expired on {}.", &iso_time(not_after)[..10]));
    }
    if extension::<KeyUsage>(certificate).is_some_and(|usage| !usage.digital_signature() && !usage.non_repudiation()) {
        problems.push("This certificate isn't allowed to make signatures.".into());
    }
    let allows = |usages: &ExtendedKeyUsage| usages.0.iter().any(|usage| DOCUMENT_SIGNING_USAGES.contains(&usage.to_string().as_str()));
    if extension::<ExtendedKeyUsage>(certificate).is_some_and(|usages| !allows(&usages)) {
        problems.push("This certificate is for other purposes and can't sign documents.".into());
    }
    match key_info(certificate) {
        None => problems.push("This certificate uses a kind of key Clumsy can't sign with.".into()),
        Some(key) if key.key_type == KeyType::Rsa && key.bits < 2048 => problems.push("This certificate's RSA key is shorter than 2048 bits.".into()),
        Some(_) => {}
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_integer_bits() {
        assert_eq!(integer_bits(&[0x00, 0x80, 0x00]), 16);
        assert_eq!(integer_bits(&[0x01, 0x00]), 9);
        assert_eq!(integer_bits(&[0x00]), 0);
    }

    #[test]
    fn picks_the_digest_for_each_key() {
        assert_eq!(KeyInfo { key_type: KeyType::Rsa, bits: 4096 }.signing_digest(), Digest::Sha256);
        assert_eq!(KeyInfo { key_type: KeyType::Ec, bits: 256 }.signing_digest(), Digest::Sha256);
        assert_eq!(KeyInfo { key_type: KeyType::Ec, bits: 384 }.signing_digest(), Digest::Sha384);
        assert_eq!(KeyInfo { key_type: KeyType::Ec, bits: 521 }.signing_digest(), Digest::Sha512);
    }
}
