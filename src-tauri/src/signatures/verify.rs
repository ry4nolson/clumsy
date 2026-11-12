use x509_cert::Certificate;

use super::algorithms::Digest;
use super::certs;
use super::cms;
use super::pdf::{covered, signature_contents};
use super::revocation::{self, Pair, Status};
use super::trust::{self, TrustOptions};
use super::tsa;
use super::types::{
    Integrity, Material, PadesLevel, Revocation, RevocationSource, SignatureStatus, SignatureVerdict, SigningTime, TimeSource, VerifyItem,
};

pub const CADES: &str = "ETSI.CAdES.detached";
pub const RFC3161: &str = "ETSI.RFC3161";
const PKCS7: &str = "adbe.pkcs7.detached";
const PKCS7_SHA1: &str = "adbe.pkcs7.sha1";

pub struct Context<'a> {
    pub material: &'a Material,
    pub has_dss: bool,
    pub trust: &'a TrustOptions,
    pub now: i64,
}

pub struct Outcome {
    pub verdict: SignatureVerdict,
    pub chains: Vec<Vec<Vec<u8>>>,
}

fn base(item: &VerifyItem) -> SignatureVerdict {
    SignatureVerdict {
        id: item.id.clone(),
        status: SignatureStatus::Invalid,
        integrity: Integrity::Malformed,
        signer: None,
        chain: Vec::new(),
        trusted: false,
        signing_time: item.claimed_time.clone().map(|time| SigningTime { time, source: TimeSource::Claimed, authority: None }),
        revocation: Revocation::NotChecked,
        revocation_source: None,
        digest_algorithm: String::new(),
        signature_algorithm: String::new(),
        level: None,
        problems: Vec::new(),
    }
}

struct Judgement {
    trusted: bool,
    expired: bool,
    chain: Vec<Vec<u8>>,
    revocation: Revocation,
    source: Option<RevocationSource>,
    all_from_dss: bool,
    problems: Vec<String>,
}

fn parsed_chain(chain: &[Vec<u8>]) -> Vec<(Certificate, &[u8])> {
    chain.iter().filter_map(|der| certs::parse(der).ok().map(|certificate| (certificate, der.as_slice()))).collect()
}

fn valid_window(chain: &[(Certificate, &[u8])]) -> Option<i64> {
    let start = chain.iter().map(|(certificate, _)| certs::validity(certificate).0).max()?;
    let end = chain.iter().map(|(certificate, _)| certs::validity(certificate).1).min()?;
    (start <= end).then_some(end)
}

fn judge(signer_der: &[u8], others: &[Vec<u8>], at: i64, context: &Context<'_>) -> Judgement {
    let mut candidates = vec![signer_der.to_vec()];
    candidates.extend(others.iter().chain(&context.material.certs).filter(|der| der.as_slice() != signer_der).cloned());
    let mut result = trust::evaluate(&candidates, at, context.trust);
    let mut chain = if result.chain.is_empty() { vec![signer_der.to_vec()] } else { result.chain.clone() };
    let parsed = parsed_chain(&chain);
    let expired = parsed.iter().any(|(certificate, _)| {
        let (not_before, not_after) = certs::validity(certificate);
        at < not_before || at > not_after
    });
    if !result.trusted && expired && let Some(moment) = valid_window(&parsed) {
        result = trust::evaluate(&candidates, moment, context.trust);
        if !result.chain.is_empty() {
            chain = result.chain.clone();
        }
    }
    let mut judgement = Judgement {
        trusted: result.trusted,
        expired,
        chain,
        revocation: Revocation::NotChecked,
        source: None,
        all_from_dss: false,
        problems: Vec::new(),
    };
    if judgement.trusted {
        check_revocation(&mut judgement, at, context);
    }
    judgement
}

fn check_revocation(judgement: &mut Judgement, at: i64, context: &Context<'_>) {
    let parsed = parsed_chain(&judgement.chain);
    let pairs: Vec<Pair<'_>> = parsed
        .windows(2)
        .filter(|pair| !certs::is_self_issued(&pair[0].0))
        .map(|pair| Pair { cert: &pair[0].0, issuer: &pair[1].0, issuer_der: pair[1].1 })
        .collect();
    if pairs.is_empty() {
        return;
    }
    let (mut revoked, mut unknown, mut online) = (false, false, false);
    for pair in &pairs {
        let name = certs::display_name(&pair.cert.tbs_certificate.subject);
        let status = match revocation::embedded_status(pair, context.material, at) {
            Some(status) => status,
            None if context.trust.online => {
                online = true;
                revocation::fetch(pair, at).map(|fetched| fetched.status()).unwrap_or_else(|err| {
                    judgement.problems.push(format!("Couldn't check whether “{name}” was revoked: {err}."));
                    Status::Unknown
                })
            }
            None => Status::Unknown,
        };
        match status {
            Status::Good => {}
            Status::Revoked(time) => {
                revoked = true;
                judgement.problems.push(format!("“{name}” was revoked on {}.", &super::util::iso_time(time)[..10]));
            }
            Status::Unknown => unknown = true,
        }
    }
    judgement.revocation = if revoked {
        Revocation::Revoked
    } else if unknown {
        Revocation::Unknown
    } else {
        Revocation::Good
    };
    judgement.source = Some(if online { RevocationSource::Online } else { RevocationSource::Embedded });
    judgement.all_from_dss = context.has_dss && !online && !unknown && !revoked;
}

fn apply(verdict: &mut SignatureVerdict, judgement: Judgement) {
    verdict.trusted = judgement.trusted;
    verdict.chain = parsed_chain(&judgement.chain).iter().map(|(certificate, der)| certs::summary(certificate, der)).collect();
    verdict.revocation = judgement.revocation;
    verdict.revocation_source = judgement.source;
    verdict.problems.extend(judgement.problems);
    if !judgement.trusted {
        verdict.problems.push("The certificate doesn't lead to an authority this Mac trusts.".into());
    } else if judgement.expired {
        verdict.problems.push("The certificate wasn't valid at the time it was checked against.".into());
    }
    if judgement.revocation == Revocation::Unknown {
        verdict.problems.push("Whether the certificate was revoked is unknown.".into());
    }
    verdict.status = if judgement.revocation == Revocation::Revoked {
        SignatureStatus::Revoked
    } else if !judgement.trusted {
        SignatureStatus::Unverified
    } else if judgement.expired {
        SignatureStatus::Expired
    } else if judgement.revocation == Revocation::Unknown {
        SignatureStatus::Unknown
    } else {
        SignatureStatus::Valid
    };
}

fn mark_weak(verdict: &mut SignatureVerdict, weak: bool) {
    if weak {
        verdict.problems.push("The signature uses SHA-1 or a short RSA key, which can be forged.".into());
        verdict.status = verdict.status.max(SignatureStatus::Weak);
    }
}

struct ProvenTime {
    time: i64,
    authority: String,
    chain: Vec<Vec<u8>>,
}

fn signature_timestamp(token: &[u8], signature: &[u8], context: &Context<'_>) -> Result<ProvenTime, String> {
    let token = tsa::read_token(token)?;
    if !token.imprint_matches(&[signature]) {
        return Err("The timestamp is for a different signature.".into());
    }
    let index = token.check()?;
    let (certificate, der) = &token.cms.certificates[index];
    let others: Vec<Vec<u8>> = token.cms.certificates.iter().map(|(_, der)| der.clone()).collect();
    let result = trust::evaluate(&[vec![der.clone()], others].concat(), token.time, context.trust);
    if !result.trusted {
        return Err("The timestamp authority isn't trusted, so the signing time is only claimed.".into());
    }
    Ok(ProvenTime { time: token.time, authority: certs::display_name(&certificate.tbs_certificate.subject), chain: result.chain })
}

fn timestamped(time: &ProvenTime) -> SigningTime {
    SigningTime { time: super::util::iso_time(time.time), source: TimeSource::Timestamp, authority: Some(time.authority.clone()) }
}

fn verify_document_timestamp(pdf: &[u8], item: &VerifyItem, contents: &[u8], context: &Context<'_>, outcome: &mut Outcome) {
    let verdict = &mut outcome.verdict;
    let token = match tsa::read_token(contents) {
        Ok(token) => token,
        Err(err) => return verdict.problems.push(err),
    };
    verdict.digest_algorithm = Digest::from_oid(&token.info.message_imprint.hash_algorithm.oid).map_or_else(String::new, |digest| digest.name().into());
    verdict.signature_algorithm = token.cms.scheme().map(|scheme| scheme.name()).unwrap_or_default();
    let Ok(parts) = covered(pdf, &item.byte_range) else { return };
    let checked = if token.imprint_matches(&parts) { token.check() } else { Err("The document has been changed since it was timestamped.".into()) };
    let signer_index = token.cms.signer_index();
    if let Some(index) = signer_index {
        let (certificate, der) = &token.cms.certificates[index];
        verdict.signer = Some(certs::summary(certificate, der));
    }
    let index = match checked {
        Ok(index) => index,
        Err(err) => {
            verdict.integrity = Integrity::Altered;
            return verdict.problems.push(err);
        }
    };
    verdict.integrity = Integrity::Intact;
    let (certificate, der) = &token.cms.certificates[index];
    let authority = certs::display_name(&certificate.tbs_certificate.subject);
    verdict.signing_time = Some(SigningTime { time: super::util::iso_time(token.time), source: TimeSource::Timestamp, authority: Some(authority) });
    let others: Vec<Vec<u8>> = token.cms.certificates.iter().map(|(_, der)| der.clone()).collect();
    let judgement = judge(der, &others, token.time, context);
    outcome.chains.push(judgement.chain.clone());
    apply(verdict, judgement);
    let digest = Digest::from_oid(&token.info.message_imprint.hash_algorithm.oid);
    let weak = digest == Some(Digest::Sha1) || token.cms.digest() == Some(Digest::Sha1) || certs::is_weak_key(certificate);
    mark_weak(verdict, weak);
}

fn verify_signature(pdf: &[u8], item: &VerifyItem, contents: &[u8], context: &Context<'_>, outcome: &mut Outcome) -> Option<bool> {
    let verdict = &mut outcome.verdict;
    let parsed = match cms::parse(contents) {
        Ok(parsed) => parsed,
        Err(err) => {
            verdict.problems.push(err);
            return None;
        }
    };
    if !parsed.has_signed_attributes() {
        verdict.status = SignatureStatus::Unsupported;
        verdict.problems.push("Clumsy can't check signatures without signed attributes.".into());
        return None;
    }
    let Some(digest) = parsed.digest() else {
        verdict.problems.push("The signature uses an unsupported digest algorithm.".into());
        return None;
    };
    verdict.digest_algorithm = digest.name().into();
    let scheme = parsed.scheme();
    verdict.signature_algorithm = scheme.as_ref().map(|scheme| scheme.name()).unwrap_or_default();
    let parts = covered(pdf, &item.byte_range).ok()?;
    let content_digest = if item.sub_filter == PKCS7_SHA1 {
        match parsed.econtent() {
            Some(content) if content == Digest::Sha1.hash(&parts) => digest.hash(&[&content]),
            _ => {
                verdict.integrity = Integrity::Altered;
                verdict.problems.push("The document has been changed since it was signed.".into());
                return None;
            }
        }
    } else {
        digest.hash(&parts)
    };
    if let Some(index) = parsed.signer_index() {
        let (certificate, der) = &parsed.certificates[index];
        verdict.signer = Some(certs::summary(certificate, der));
    }
    let index = match parsed.check(&content_digest) {
        Ok(index) => index,
        Err(err) => {
            verdict.integrity = Integrity::Altered;
            verdict.problems.push(err);
            return None;
        }
    };
    verdict.integrity = Integrity::Intact;
    let (certificate, der) = &parsed.certificates[index];
    let mut at = context.now;
    let mut proven = false;
    if let Some(token) = parsed.timestamp_token() {
        match signature_timestamp(&token, parsed.signature(), context) {
            Ok(time) => {
                at = time.time;
                proven = true;
                verdict.signing_time = Some(timestamped(&time));
                outcome.chains.push(time.chain);
            }
            Err(err) => verdict.problems.push(err),
        }
    }
    let others: Vec<Vec<u8>> = parsed.certificates.iter().map(|(_, der)| der.clone()).collect();
    let judgement = judge(der, &others, at, context);
    let long_term = judgement.all_from_dss;
    outcome.chains.push(judgement.chain.clone());
    apply(verdict, judgement);
    let weak = digest == Digest::Sha1 || scheme.is_ok_and(|scheme| scheme.digest == Digest::Sha1) || certs::is_weak_key(certificate);
    mark_weak(verdict, weak);
    if item.sub_filter == CADES {
        verdict.level = Some(match (proven, long_term) {
            (false, _) => PadesLevel::Basic,
            (true, false) => PadesLevel::Timestamped,
            (true, true) => PadesLevel::LongTerm,
        });
    }
    Some(long_term)
}

fn verify_item(pdf: &[u8], item: &VerifyItem, context: &Context<'_>, later_seal: bool) -> Outcome {
    let mut outcome = Outcome { verdict: base(item), chains: Vec::new() };
    if ![CADES, RFC3161, PKCS7, PKCS7_SHA1].contains(&item.sub_filter.as_str()) {
        outcome.verdict.status = SignatureStatus::Unsupported;
        outcome.verdict.problems.push(format!("Clumsy can't check {} signatures.", item.sub_filter));
        return outcome;
    }
    let contents = match signature_contents(pdf, &item.byte_range) {
        Ok(contents) => contents,
        Err(err) => {
            outcome.verdict.problems.push(err);
            return outcome;
        }
    };
    if item.sub_filter == RFC3161 {
        verify_document_timestamp(pdf, item, &contents, context, &mut outcome);
    } else if verify_signature(pdf, item, &contents, context, &mut outcome) == Some(true)
        && later_seal
        && outcome.verdict.level == Some(PadesLevel::LongTerm)
    {
        outcome.verdict.level = Some(PadesLevel::LongTermArchive);
    }
    outcome
}

fn range_end(item: &VerifyItem) -> u64 {
    item.byte_range[2].saturating_add(item.byte_range[3])
}

pub fn verify_all(pdf: &[u8], items: &[VerifyItem], context: &Context<'_>) -> Vec<Outcome> {
    let seals: Vec<Option<Outcome>> = items.iter().map(|item| (item.sub_filter == RFC3161).then(|| verify_item(pdf, item, context, false))).collect();
    let good_seal_ends: Vec<u64> = items
        .iter()
        .zip(&seals)
        .filter(|(_, seal)| seal.as_ref().is_some_and(|seal| seal.verdict.integrity == Integrity::Intact && seal.verdict.trusted))
        .map(|(item, _)| range_end(item))
        .collect();
    items
        .iter()
        .zip(seals)
        .map(|(item, seal)| seal.unwrap_or_else(|| verify_item(pdf, item, context, good_seal_ends.iter().any(|&end| end > range_end(item)))))
        .collect()
}
