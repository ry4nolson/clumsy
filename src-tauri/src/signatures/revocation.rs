use der::asn1::{ObjectIdentifier, OctetString};
use der::{Decode, Encode};
use x509_cert::Certificate;
use x509_cert::crl::CertificateList;
use x509_cert::ext::pkix::name::{DistributionPointName, GeneralName};
use x509_cert::ext::pkix::{AuthorityInfoAccessSyntax, CrlDistributionPoints, ExtendedKeyUsage};
use x509_cert::spki::AlgorithmIdentifierOwned;
use x509_ocsp::{BasicOcspResponse, CertId, CertStatus, OcspRequest, OcspResponse, OcspResponseStatus, Request, TbsRequest, Version};

use super::algorithms::{Digest, Scheme, verify};
use super::certs;
use super::http;
use super::types::Material;
use super::util::first_child;

const OCSP_BASIC: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.5.5.7.48.1.1");
const AIA_OCSP: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.5.5.7.48.1");
const OCSP_SIGNING: ObjectIdentifier = ObjectIdentifier::new_unwrap("1.3.6.1.5.5.7.3.9");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Good,
    Revoked(i64),
    Unknown,
}

pub struct Pair<'a> {
    pub cert: &'a Certificate,
    pub issuer: &'a Certificate,
    pub issuer_der: &'a [u8],
}

fn signed_by(tbs: &[u8], algorithm: &AlgorithmIdentifierOwned, signature: &[u8], signer_der: &[u8]) -> bool {
    Scheme::from_identifier(algorithm, None).is_ok_and(|scheme| verify(signer_der, scheme, tbs, signature))
}

pub fn issued_by(cert: &Certificate, cert_der: &[u8], issuer_der: &[u8]) -> bool {
    first_child(cert_der).is_some_and(|tbs| signed_by(tbs.raw, &cert.signature_algorithm, cert.signature.raw_bytes(), issuer_der))
}

pub fn cert_id(pair: &Pair<'_>, digest: Digest) -> Result<CertId, String> {
    let name = pair.issuer.tbs_certificate.subject.to_der().map_err(|err| err.to_string())?;
    let key = pair.issuer.tbs_certificate.subject_public_key_info.subject_public_key.raw_bytes();
    Ok(CertId {
        hash_algorithm: digest.identifier(),
        issuer_name_hash: OctetString::new(digest.hash(&[&name])).map_err(|err| err.to_string())?,
        issuer_key_hash: OctetString::new(digest.hash(&[key])).map_err(|err| err.to_string())?,
        serial_number: pair.cert.tbs_certificate.serial_number.clone(),
    })
}

fn same_cert(ours: &CertId, theirs: &CertId) -> bool {
    ours.hash_algorithm.oid == theirs.hash_algorithm.oid
        && ours.issuer_name_hash == theirs.issuer_name_hash
        && ours.issuer_key_hash == theirs.issuer_key_hash
        && ours.serial_number == theirs.serial_number
}

pub fn ocsp_request(pair: &Pair<'_>) -> Result<Vec<u8>, String> {
    let request = OcspRequest {
        tbs_request: TbsRequest {
            version: Version::V1,
            requestor_name: None,
            request_list: vec![Request { req_cert: cert_id(pair, Digest::Sha1)?, single_request_extensions: None }],
            request_extensions: None,
        },
        optional_signature: None,
    };
    request.to_der().map_err(|err| err.to_string())
}

fn judged(revoked_at: i64, at: i64) -> Status {
    if revoked_at <= at { Status::Revoked(revoked_at) } else { Status::Good }
}

pub fn ocsp_status(response: &[u8], pair: &Pair<'_>, at: i64) -> Result<Status, String> {
    let response = OcspResponse::from_der(response).map_err(|err| format!("unreadable OCSP response ({err})"))?;
    if response.response_status != OcspResponseStatus::Successful {
        return Err(format!("the OCSP responder answered {:?}", response.response_status));
    }
    let bytes = response.response_bytes.ok_or("empty OCSP response")?;
    if bytes.response_type != OCSP_BASIC {
        return Err("unsupported OCSP response type".into());
    }
    let raw = bytes.response.as_bytes();
    let basic = BasicOcspResponse::from_der(raw).map_err(|err| format!("unreadable OCSP response ({err})"))?;
    let single = basic
        .tbs_response_data
        .responses
        .iter()
        .find(|single| Digest::from_oid(&single.cert_id.hash_algorithm.oid).and_then(|digest| cert_id(pair, digest).ok()).is_some_and(|id| same_cert(&id, &single.cert_id)))
        .ok_or("the OCSP response is for another certificate")?;
    let tbs = first_child(raw).ok_or("unreadable OCSP response")?;
    let signature = basic.signature.raw_bytes();
    let by_issuer = signed_by(tbs.raw, &basic.signature_algorithm, signature, pair.issuer_der);
    let by_delegate = || {
        basic.certs.iter().flatten().any(|responder| {
            let Ok(der) = responder.to_der() else { return false };
            let delegated = certs::extension::<ExtendedKeyUsage>(responder).is_some_and(|usage| usage.0.contains(&OCSP_SIGNING));
            delegated && issued_by(responder, &der, pair.issuer_der) && signed_by(tbs.raw, &basic.signature_algorithm, signature, &der)
        })
    };
    if !by_issuer && !by_delegate() {
        return Err("the OCSP response isn't signed by the certificate's issuer".into());
    }
    Ok(match &single.cert_status {
        CertStatus::Good(_) => Status::Good,
        CertStatus::Revoked(info) => judged(info.revocation_time.0.to_unix_duration().as_secs() as i64, at),
        CertStatus::Unknown(_) => Status::Unknown,
    })
}

pub fn crl_status(crl: &[u8], pair: &Pair<'_>, at: i64) -> Result<Status, String> {
    let list = CertificateList::from_der(crl).map_err(|err| format!("unreadable CRL ({err})"))?;
    let tbs = &list.tbs_cert_list;
    if tbs.issuer.to_der().ok() != pair.issuer.tbs_certificate.subject.to_der().ok() {
        return Err("the CRL is from another issuer".into());
    }
    let raw = first_child(crl).ok_or("unreadable CRL")?;
    if !signed_by(raw.raw, &list.signature_algorithm, list.signature.raw_bytes(), pair.issuer_der) {
        return Err("the CRL isn't signed by the certificate's issuer".into());
    }
    let serial = &pair.cert.tbs_certificate.serial_number;
    let revoked = tbs.revoked_certificates.iter().flatten().find(|entry| entry.serial_number == *serial);
    Ok(revoked.map_or(Status::Good, |entry| judged(entry.revocation_date.to_unix_duration().as_secs() as i64, at)))
}

pub fn embedded_status(pair: &Pair<'_>, material: &Material, at: i64) -> Option<Status> {
    let from_ocsp = material.ocsps.iter().filter_map(|response| ocsp_status(response, pair, at).ok());
    let from_crl = material.crls.iter().filter_map(|crl| crl_status(crl, pair, at).ok());
    let found: Vec<Status> = from_ocsp.chain(from_crl).filter(|status| *status != Status::Unknown).collect();
    found.iter().copied().find(|status| matches!(status, Status::Revoked(_))).or_else(|| found.first().copied())
}

fn urls(names: impl Iterator<Item = GeneralName>) -> impl Iterator<Item = String> {
    names.filter_map(|name| match name {
        GeneralName::UniformResourceIdentifier(uri) => Some(uri.to_string()),
        _ => None,
    })
}

pub fn ocsp_urls(cert: &Certificate) -> Vec<String> {
    let access = certs::extension::<AuthorityInfoAccessSyntax>(cert).map(|access| access.0).unwrap_or_default();
    urls(access.into_iter().filter(|entry| entry.access_method == AIA_OCSP).map(|entry| entry.access_location)).filter(|url| http::is_web_url(url)).collect()
}

pub fn crl_urls(cert: &Certificate) -> Vec<String> {
    let points = certs::extension::<CrlDistributionPoints>(cert).map(|points| points.0).unwrap_or_default();
    let names = points.into_iter().filter_map(|point| match point.distribution_point {
        Some(DistributionPointName::FullName(names)) => Some(names),
        _ => None,
    });
    urls(names.flatten()).filter(|url| http::is_web_url(url)).collect()
}

pub enum Fetched {
    Ocsp(Vec<u8>, Status),
    Crl(Vec<u8>, Status),
}

impl Fetched {
    pub fn status(&self) -> Status {
        match self {
            Self::Ocsp(_, status) | Self::Crl(_, status) => *status,
        }
    }
}

pub fn fetch(pair: &Pair<'_>, at: i64) -> Result<Fetched, String> {
    let mut last_error = "the certificate names no revocation service".to_string();
    if let Ok(request) = ocsp_request(pair) {
        for url in ocsp_urls(pair.cert) {
            let result = http::post(&url, "application/ocsp-request", request.clone(), http::REVOCATION_TIMEOUT)
                .and_then(|response| ocsp_status(&response, pair, at).map(|status| Fetched::Ocsp(response, status)));
            match result {
                Ok(fetched) => return Ok(fetched),
                Err(err) => last_error = format!("{url}: {err}"),
            }
        }
    }
    for url in crl_urls(pair.cert) {
        let result = http::get(&url, http::REVOCATION_TIMEOUT).and_then(|crl| crl_status(&crl, pair, at).map(|status| Fetched::Crl(crl, status)));
        match result {
            Ok(fetched) => return Ok(fetched),
            Err(err) => last_error = format!("{url}: {err}"),
        }
    }
    Err(last_error)
}
