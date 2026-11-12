use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub type ByteRange = [u64; 4];

pub const CONTENTS_HEX_LENGTH: usize = 65536;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CertificateSummary {
    pub common_name: String,
    pub email: Option<String>,
    pub organization: Option<String>,
    pub issuer: String,
    pub serial: String,
    pub not_before: String,
    pub not_after: String,
    pub fingerprint: String,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum SignatureStatus {
    Valid,
    Unknown,
    Weak,
    Expired,
    Unverified,
    Revoked,
    Invalid,
    Unsupported,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Integrity {
    Intact,
    Altered,
    Malformed,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TimeSource {
    Timestamp,
    Claimed,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct SigningTime {
    pub time: String,
    pub source: TimeSource,
    pub authority: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Revocation {
    Good,
    Revoked,
    Unknown,
    NotChecked,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RevocationSource {
    Embedded,
    Online,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub enum PadesLevel {
    #[serde(rename = "B-B")]
    Basic,
    #[serde(rename = "B-T")]
    Timestamped,
    #[serde(rename = "B-LT")]
    LongTerm,
    #[serde(rename = "B-LTA")]
    LongTermArchive,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignatureVerdict {
    pub id: String,
    pub status: SignatureStatus,
    pub integrity: Integrity,
    pub signer: Option<CertificateSummary>,
    pub chain: Vec<CertificateSummary>,
    pub trusted: bool,
    pub signing_time: Option<SigningTime>,
    pub revocation: Revocation,
    pub revocation_source: Option<RevocationSource>,
    pub digest_algorithm: String,
    pub signature_algorithm: String,
    pub level: Option<PadesLevel>,
    pub problems: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyItem {
    pub id: String,
    pub byte_range: ByteRange,
    pub sub_filter: String,
    pub claimed_time: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum KeyType {
    Rsa,
    Ec,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SigningIdentity {
    pub fingerprint: String,
    pub certificate: CertificateSummary,
    pub key_type: KeyType,
    pub key_bits: u32,
    pub hardware: bool,
    pub trusted: bool,
    pub usable: bool,
    pub problems: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignaturePlaceholder {
    pub byte_range_at: usize,
    pub byte_range_length: usize,
    pub contents_at: usize,
    pub contents_length: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignRequest {
    pub placeholder: SignaturePlaceholder,
    pub identity: String,
    pub document_name: String,
    pub timestamp_url: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimestampRequest {
    pub placeholder: SignaturePlaceholder,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ValidationRequest {
    pub items: Vec<VerifyItem>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
pub struct VriEntry {
    pub certs: Vec<usize>,
    pub ocsps: Vec<usize>,
    pub crls: Vec<usize>,
}

#[derive(Clone, Debug, Default)]
pub struct Material {
    pub certs: Vec<Vec<u8>>,
    pub ocsps: Vec<Vec<u8>>,
    pub crls: Vec<Vec<u8>>,
}

#[derive(Clone, Debug, Default)]
pub struct ValidationMaterial {
    pub material: Material,
    pub vri: BTreeMap<String, VriEntry>,
    pub problems: Vec<String>,
}
