use der::asn1::ObjectIdentifier;
use der::{Any, Decode};
use security_framework::certificate::SecCertificate;
use security_framework::key::{Algorithm, SecKey};
use sha1::Sha1;
use sha2::{Digest as _, Sha256, Sha384, Sha512};
use x509_cert::spki::AlgorithmIdentifierOwned;

use super::util::children;

const fn oid(text: &str) -> ObjectIdentifier {
    ObjectIdentifier::new_unwrap(text)
}

pub const SHA1: ObjectIdentifier = oid("1.3.14.3.2.26");
pub const SHA256: ObjectIdentifier = oid("2.16.840.1.101.3.4.2.1");
pub const SHA384: ObjectIdentifier = oid("2.16.840.1.101.3.4.2.2");
pub const SHA512: ObjectIdentifier = oid("2.16.840.1.101.3.4.2.3");
pub const RSA_ENCRYPTION: ObjectIdentifier = oid("1.2.840.113549.1.1.1");
const RSA_PSS: ObjectIdentifier = oid("1.2.840.113549.1.1.10");
const RSA_SHA1: ObjectIdentifier = oid("1.2.840.113549.1.1.5");
const RSA_SHA256: ObjectIdentifier = oid("1.2.840.113549.1.1.11");
const RSA_SHA384: ObjectIdentifier = oid("1.2.840.113549.1.1.12");
const RSA_SHA512: ObjectIdentifier = oid("1.2.840.113549.1.1.13");
pub const EC_PUBLIC_KEY: ObjectIdentifier = oid("1.2.840.10045.2.1");
const ECDSA_SHA1: ObjectIdentifier = oid("1.2.840.10045.4.1");
const ECDSA_SHA256: ObjectIdentifier = oid("1.2.840.10045.4.3.2");
const ECDSA_SHA384: ObjectIdentifier = oid("1.2.840.10045.4.3.3");
const ECDSA_SHA512: ObjectIdentifier = oid("1.2.840.10045.4.3.4");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Digest {
    Sha1,
    Sha256,
    Sha384,
    Sha512,
}

impl Digest {
    pub fn from_oid(oid: &ObjectIdentifier) -> Option<Self> {
        [(SHA1, Self::Sha1), (SHA256, Self::Sha256), (SHA384, Self::Sha384), (SHA512, Self::Sha512)]
            .into_iter()
            .find_map(|(known, digest)| (known == *oid).then_some(digest))
    }

    pub fn oid(self) -> ObjectIdentifier {
        match self {
            Self::Sha1 => SHA1,
            Self::Sha256 => SHA256,
            Self::Sha384 => SHA384,
            Self::Sha512 => SHA512,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Self::Sha1 => "SHA-1",
            Self::Sha256 => "SHA-256",
            Self::Sha384 => "SHA-384",
            Self::Sha512 => "SHA-512",
        }
    }

    pub fn identifier(self) -> AlgorithmIdentifierOwned {
        AlgorithmIdentifierOwned { oid: self.oid(), parameters: None }
    }

    pub fn hash(self, parts: &[&[u8]]) -> Vec<u8> {
        fn run<D: sha2::Digest>(parts: &[&[u8]]) -> Vec<u8> {
            let mut hasher = D::new();
            parts.iter().for_each(|part| hasher.update(part));
            hasher.finalize().to_vec()
        }
        match self {
            Self::Sha1 => run::<Sha1>(parts),
            Self::Sha256 => run::<Sha256>(parts),
            Self::Sha384 => run::<Sha384>(parts),
            Self::Sha512 => run::<Sha512>(parts),
        }
    }
}

pub fn sha256(bytes: &[u8]) -> Vec<u8> {
    Sha256::digest(bytes).to_vec()
}

pub fn sha1(bytes: &[u8]) -> Vec<u8> {
    Sha1::digest(bytes).to_vec()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Padding {
    Pkcs1,
    Pss,
    Ecdsa,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Scheme {
    pub padding: Padding,
    pub digest: Digest,
}

fn pss_digest(parameters: Option<&Any>) -> Option<Digest> {
    let Some(parameters) = parameters else { return Some(Digest::Sha1) };
    let fields = children(parameters.value())?;
    let Some(hash) = fields.iter().find(|field| field.tag == 0xa0) else { return Some(Digest::Sha1) };
    let identifier = AlgorithmIdentifierOwned::from_der(hash.value).ok()?;
    Digest::from_oid(&identifier.oid)
}

impl Scheme {
    pub fn from_identifier(identifier: &AlgorithmIdentifierOwned, digest: Option<Digest>) -> Result<Self, String> {
        let oid = identifier.oid;
        let explicit = [
            (RSA_SHA1, Padding::Pkcs1, Digest::Sha1),
            (RSA_SHA256, Padding::Pkcs1, Digest::Sha256),
            (RSA_SHA384, Padding::Pkcs1, Digest::Sha384),
            (RSA_SHA512, Padding::Pkcs1, Digest::Sha512),
            (ECDSA_SHA1, Padding::Ecdsa, Digest::Sha1),
            (ECDSA_SHA256, Padding::Ecdsa, Digest::Sha256),
            (ECDSA_SHA384, Padding::Ecdsa, Digest::Sha384),
            (ECDSA_SHA512, Padding::Ecdsa, Digest::Sha512),
        ];
        if let Some((_, padding, digest)) = explicit.into_iter().find(|(known, ..)| *known == oid) {
            return Ok(Self { padding, digest });
        }
        let unsupported = || format!("Unsupported signature algorithm {oid}");
        match oid {
            RSA_ENCRYPTION => Ok(Self { padding: Padding::Pkcs1, digest: digest.ok_or_else(unsupported)? }),
            EC_PUBLIC_KEY => Ok(Self { padding: Padding::Ecdsa, digest: digest.ok_or_else(unsupported)? }),
            RSA_PSS => Ok(Self { padding: Padding::Pss, digest: pss_digest(identifier.parameters.as_ref()).ok_or_else(unsupported)? }),
            _ => Err(unsupported()),
        }
    }

    pub fn identifier(self) -> AlgorithmIdentifierOwned {
        let oid = match (self.padding, self.digest) {
            (Padding::Ecdsa, Digest::Sha1) => ECDSA_SHA1,
            (Padding::Ecdsa, Digest::Sha256) => ECDSA_SHA256,
            (Padding::Ecdsa, Digest::Sha384) => ECDSA_SHA384,
            (Padding::Ecdsa, Digest::Sha512) => ECDSA_SHA512,
            (_, Digest::Sha1) => RSA_SHA1,
            (_, Digest::Sha256) => RSA_SHA256,
            (_, Digest::Sha384) => RSA_SHA384,
            (_, Digest::Sha512) => RSA_SHA512,
        };
        let parameters = (self.padding != Padding::Ecdsa).then(|| Any::from(der::asn1::Null));
        AlgorithmIdentifierOwned { oid, parameters }
    }

    pub fn name(self) -> String {
        let padding = match self.padding {
            Padding::Pkcs1 => "RSA",
            Padding::Pss => "RSA-PSS",
            Padding::Ecdsa => "ECDSA",
        };
        format!("{padding} with {}", self.digest.name())
    }

    pub fn sec_algorithm(self) -> Algorithm {
        match (self.padding, self.digest) {
            (Padding::Pkcs1, Digest::Sha1) => Algorithm::RSASignatureMessagePKCS1v15SHA1,
            (Padding::Pkcs1, Digest::Sha256) => Algorithm::RSASignatureMessagePKCS1v15SHA256,
            (Padding::Pkcs1, Digest::Sha384) => Algorithm::RSASignatureMessagePKCS1v15SHA384,
            (Padding::Pkcs1, Digest::Sha512) => Algorithm::RSASignatureMessagePKCS1v15SHA512,
            (Padding::Pss, Digest::Sha1) => Algorithm::RSASignatureMessagePSSSHA1,
            (Padding::Pss, Digest::Sha256) => Algorithm::RSASignatureMessagePSSSHA256,
            (Padding::Pss, Digest::Sha384) => Algorithm::RSASignatureMessagePSSSHA384,
            (Padding::Pss, Digest::Sha512) => Algorithm::RSASignatureMessagePSSSHA512,
            (Padding::Ecdsa, Digest::Sha1) => Algorithm::ECDSASignatureMessageX962SHA1,
            (Padding::Ecdsa, Digest::Sha256) => Algorithm::ECDSASignatureMessageX962SHA256,
            (Padding::Ecdsa, Digest::Sha384) => Algorithm::ECDSASignatureMessageX962SHA384,
            (Padding::Ecdsa, Digest::Sha512) => Algorithm::ECDSASignatureMessageX962SHA512,
        }
    }
}

pub fn verify(certificate_der: &[u8], scheme: Scheme, data: &[u8], signature: &[u8]) -> bool {
    let Ok(key) = SecCertificate::from_der(certificate_der).and_then(|certificate| certificate.public_key()) else {
        return false;
    };
    key.verify_signature(scheme.sec_algorithm(), data, signature).unwrap_or(false)
}

fn digest_algorithm(scheme: Scheme) -> Result<Algorithm, String> {
    Ok(match (scheme.padding, scheme.digest) {
        (Padding::Pkcs1, Digest::Sha256) => Algorithm::RSASignatureDigestPKCS1v15SHA256,
        (Padding::Pkcs1, Digest::Sha384) => Algorithm::RSASignatureDigestPKCS1v15SHA384,
        (Padding::Pkcs1, Digest::Sha512) => Algorithm::RSASignatureDigestPKCS1v15SHA512,
        (Padding::Ecdsa, Digest::Sha256) => Algorithm::ECDSASignatureDigestX962SHA256,
        (Padding::Ecdsa, Digest::Sha384) => Algorithm::ECDSASignatureDigestX962SHA384,
        (Padding::Ecdsa, Digest::Sha512) => Algorithm::ECDSASignatureDigestX962SHA512,
        _ => return Err(format!("Clumsy doesn't sign with {}", scheme.name())),
    })
}

pub fn sign(key: &SecKey, scheme: Scheme, data: &[u8]) -> Result<Vec<u8>, String> {
    let algorithm = digest_algorithm(scheme)?;
    key.create_signature(algorithm, &scheme.digest.hash(&[data])).map_err(|err| format!("The key couldn't sign: {}", err.description()))
}
