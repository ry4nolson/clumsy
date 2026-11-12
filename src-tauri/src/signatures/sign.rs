use x509_cert::Certificate;

use super::algorithms::{self, Digest, Padding, Scheme, sha256};
use super::certs;
use super::cms::{self, Signer};
use super::identities::{self, KeychainIdentity};
use super::pdf::{digest_range, embed_contents, fill_byte_range};
use super::revocation::{self, Pair, Status};
use super::trust::{self, TrustOptions};
use super::tsa;
use super::types::{KeyType, SignRequest, SignaturePlaceholder, TimestampRequest};
use super::util::now;

pub struct Prepared {
    pdf: Vec<u8>,
    placeholder: SignaturePlaceholder,
    digest: Vec<u8>,
    identity: KeychainIdentity,
    certificate: Certificate,
    scheme: Scheme,
    pub signer_name: String,
    pub issuer_name: String,
}

pub fn scheme_for(certificate: &Certificate) -> Result<Scheme, String> {
    let key = certs::key_info(certificate).ok_or("This certificate uses a kind of key Clumsy can't sign with.")?;
    let padding = if key.key_type == KeyType::Rsa { Padding::Pkcs1 } else { Padding::Ecdsa };
    Ok(Scheme { padding, digest: key.signing_digest() })
}

pub fn embedded_chain(certificate: &Certificate, chain: &[Vec<u8>]) -> Vec<(Certificate, Vec<u8>)> {
    chain
        .iter()
        .filter_map(|der| certs::parse(der).ok().map(|parsed| (parsed, der.clone())))
        .filter(|(parsed, _)| parsed != certificate && !certs::is_self_issued(parsed))
        .collect()
}

fn check_not_revoked(certificate: &Certificate, chain: &[Vec<u8>], at: i64) -> Result<(), String> {
    let Some(issuer_der) = chain.get(1) else { return Ok(()) };
    let Ok(issuer) = certs::parse(issuer_der) else { return Ok(()) };
    let pair = Pair { cert: certificate, issuer: &issuer, issuer_der };
    match revocation::fetch(&pair, at).map(|fetched| fetched.status()) {
        Ok(Status::Revoked(_)) => Err("This certificate has been revoked, so it can't sign.".into()),
        _ => Ok(()),
    }
}

pub fn prepare(mut pdf: Vec<u8>, request: &SignRequest) -> Result<Prepared, String> {
    let identity = identities::find(&request.identity)?;
    let certificate = certs::parse(&identity.der)?;
    let at = now();
    let problems = certs::signing_problems(&certificate, at);
    if !problems.is_empty() {
        return Err(problems.join(" "));
    }
    let scheme = scheme_for(&certificate)?;
    let range = fill_byte_range(&mut pdf, &request.placeholder)?;
    let digest = digest_range(&pdf, &range, scheme.digest)?;
    Ok(Prepared {
        signer_name: certs::display_name(&certificate.tbs_certificate.subject),
        issuer_name: certs::display_name(&certificate.tbs_certificate.issuer),
        pdf,
        placeholder: request.placeholder,
        digest,
        identity,
        certificate,
        scheme,
    })
}

#[cfg(test)]
pub fn signed_cms(signer: &Signer<'_>, digest: &[u8], sign: impl FnOnce(&[u8]) -> Result<Vec<u8>, String>, timestamp_url: Option<&str>) -> Result<Vec<u8>, String> {
    let mut signature = Vec::new();
    let der = cms::build(signer, digest, |data| {
        signature = sign(data)?;
        Ok(signature.clone())
    })?;
    match timestamp_url {
        Some(url) => cms::add_timestamp(&der, &tsa::fetch(url, &sha256(&signature))?),
        None => Ok(der),
    }
}

pub struct Signed {
    pdf: Vec<u8>,
    placeholder: SignaturePlaceholder,
    pub der: Vec<u8>,
    pub signature: Vec<u8>,
}

pub fn sign_without_timestamp(prepared: Prepared) -> Result<Signed, String> {
    let Prepared { pdf, placeholder, digest, identity, certificate, scheme, .. } = prepared;
    let at = now();
    let options = TrustOptions { online: true, fetch_issuers: true, anchors: Vec::new() };
    let result = trust::evaluate(std::slice::from_ref(&identity.der), at, &options);
    check_not_revoked(&certificate, &result.chain, at)?;
    let chain: Vec<Certificate> = embedded_chain(&certificate, &result.chain).into_iter().map(|(parsed, _)| parsed).collect();
    let key = identity.identity.private_key().map_err(|err| format!("The signing key isn't available: {err}"))?;
    let signer = Signer { certificate: &certificate, certificate_der: &identity.der, chain: &chain, scheme };
    let mut signature = Vec::new();
    let der = cms::build(&signer, &digest, |data| {
        signature = algorithms::sign(&key, scheme, data)?;
        Ok(signature.clone())
    })?;
    Ok(Signed { pdf, placeholder, der, signature })
}

pub fn timestamped(der: &[u8], signature: &[u8], url: &str) -> Result<Vec<u8>, String> {
    cms::add_timestamp(der, &tsa::fetch(url, &sha256(signature))?)
}

pub fn embed(signed: Signed, der: &[u8]) -> Result<Vec<u8>, String> {
    let Signed { mut pdf, placeholder, .. } = signed;
    embed_contents(&mut pdf, &placeholder, der)?;
    Ok(pdf)
}

pub fn without_timestamp_prompt(document_name: &str, error: &str) -> String {
    let name: String = document_name.chars().filter(|character| !character.is_control()).take(120).collect();
    let detail = error.trim_start_matches("timestamp: ");
    format!("Clumsy couldn't get a timestamp for “{name}”: {detail}\n\nWithout a timestamp, the signing time is only what this computer's clock says, and the signature stops verifying once the certificate expires.")
}

pub fn timestamp_document(mut pdf: Vec<u8>, request: &TimestampRequest) -> Result<Vec<u8>, String> {
    let range = fill_byte_range(&mut pdf, &request.placeholder)?;
    let imprint = digest_range(&pdf, &range, Digest::Sha256)?;
    let token = tsa::fetch(&request.url, &imprint)?;
    embed_contents(&mut pdf, &request.placeholder, &token)?;
    Ok(pdf)
}

pub fn confirmation(document_name: &str, prepared: &Prepared) -> String {
    let name: String = document_name.chars().filter(|character| !character.is_control()).take(120).collect();
    format!("Sign “{name}” as {} ({})?", prepared.signer_name, prepared.issuer_name)
}
