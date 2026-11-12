use der::Decode;
use der::asn1::ObjectIdentifier;
use x509_tsp::TimeStampReq;

use super::algorithms::{self, Digest, Padding, Scheme, sha256};
use super::certs;
use super::cms::{self, Signer};
use super::pdf::tests::{append_placeholder, prepared_pdf};
use super::pdf::{digest_range, embed_contents, fill_byte_range};
use super::revocation::{self, Status};
use super::test_pki::*;
use super::trust::TrustOptions;
use super::tsa;
use super::types::{ByteRange, Integrity, Material, PadesLevel, Revocation, RevocationSource, SignatureStatus, SignatureVerdict, TimeSource, VerifyItem};
use super::util::now;
use super::verify::{CADES, Context, RFC3161, verify_all};

struct Pki {
    root: Issued,
    leaf: Issued,
    tsa: Issued,
}

fn pki_with(leaf_key: TestKey, leaf_validity: (i64, i64)) -> Pki {
    let root = issue(ec_key(), "Test Root", 1, None, (JAN_2020 - YEAR, JAN_2020 + 20 * YEAR), Role::Authority);
    let leaf = issue(leaf_key, "Ryan Tester", 2, Some(&root), leaf_validity, Role::Signer);
    let tsa = issue(ec_key(), "Test TSA", 3, Some(&root), (JAN_2020 - YEAR, JAN_2020 + 20 * YEAR), Role::Timestamping);
    Pki { root, leaf, tsa }
}

fn pki() -> Pki {
    pki_with(ec_key(), (JAN_2020, JAN_2020 + 15 * YEAR))
}

fn build_cms(pki: &Pki, scheme: Scheme, digest: &[u8]) -> Vec<u8> {
    let signer = Signer { certificate: &pki.leaf.cert, certificate_der: &pki.leaf.der, chain: &[], scheme };
    cms::build(&signer, digest, |data| Ok(sign_with(&pki.leaf.key, scheme, data))).unwrap()
}

fn signed_pdf(pki: &Pki, scheme: Scheme, finish: impl FnOnce(Vec<u8>) -> Vec<u8>) -> (Vec<u8>, ByteRange) {
    let (mut pdf, placeholder) = prepared_pdf();
    let range = fill_byte_range(&mut pdf, &placeholder).unwrap();
    let der = finish(build_cms(pki, scheme, &digest_range(&pdf, &range, scheme.digest).unwrap()));
    embed_contents(&mut pdf, &placeholder, &der).unwrap();
    (pdf, range)
}

fn item(id: &str, range: ByteRange, sub_filter: &str) -> VerifyItem {
    VerifyItem { id: id.into(), byte_range: range, sub_filter: sub_filter.into(), claimed_time: Some("2026-11-11T12:00:00Z".into()) }
}

fn verify(pdf: &[u8], items: &[VerifyItem], material: Option<Material>, anchors: &[&Issued]) -> Vec<SignatureVerdict> {
    let options = TrustOptions { online: false, fetch_issuers: false, anchors: anchors.iter().map(|issued| issued.der.clone()).collect() };
    let has_dss = material.is_some();
    let material = material.unwrap_or_default();
    let context = Context { material: &material, has_dss, trust: &options, now: now() };
    verify_all(pdf, items, &context).into_iter().map(|outcome| outcome.verdict).collect()
}

fn empty_crl(pki: &Pki) -> Material {
    Material { crls: vec![crl(&pki.root, &[])], ..Material::default() }
}

fn ecdsa(digest: Digest) -> Scheme {
    Scheme { padding: Padding::Ecdsa, digest }
}

#[test]
fn a_valid_signature_verifies() {
    let pki = pki();
    let (pdf, range) = signed_pdf(&pki, ecdsa(Digest::Sha256), |der| der);
    let verdict = &verify(&pdf, &[item("a", range, CADES)], Some(empty_crl(&pki)), &[&pki.root])[0];
    assert_eq!(verdict.integrity, Integrity::Intact, "{:?}", verdict.problems);
    assert!(verdict.trusted);
    assert_eq!(verdict.status, SignatureStatus::Valid, "{:?}", verdict.problems);
    assert_eq!(verdict.signer.as_ref().unwrap().common_name, "Ryan Tester");
    assert_eq!(verdict.signer.as_ref().unwrap().organization.as_deref(), Some("Clumsy Tests"));
    assert_eq!(verdict.chain.len(), 2);
    assert_eq!(verdict.digest_algorithm, "SHA-256");
    assert_eq!(verdict.signature_algorithm, "ECDSA with SHA-256");
    assert_eq!(verdict.revocation, Revocation::Good);
    assert_eq!(verdict.revocation_source, Some(RevocationSource::Embedded));
    assert_eq!(verdict.level, Some(PadesLevel::Basic));
    assert_eq!(verdict.signing_time.as_ref().unwrap().source, TimeSource::Claimed);
}

#[test]
fn the_cms_has_the_pades_attributes_and_no_signing_time() {
    let pki = pki();
    let der = build_cms(&pki, ecdsa(Digest::Sha256), &[1; 32]);
    let parsed = cms::parse(&der).unwrap();
    let oids: Vec<String> = parsed.signer.signed_attrs.as_ref().unwrap().iter().map(|attribute| attribute.oid.to_string()).collect();
    assert_eq!(oids.len(), 3);
    for expected in ["1.2.840.113549.1.9.3", "1.2.840.113549.1.9.4", "1.2.840.113549.1.9.16.2.47"] {
        assert!(oids.contains(&expected.to_string()));
    }
    assert!(!oids.contains(&"1.2.840.113549.1.9.5".to_string()));
    assert_eq!(parsed.check(&[1; 32]).unwrap(), 0);
}

#[test]
fn a_changed_byte_makes_the_signature_invalid() {
    let pki = pki();
    let (mut pdf, range) = signed_pdf(&pki, ecdsa(Digest::Sha256), |der| der);
    pdf[3] ^= 1;
    let verdict = &verify(&pdf, &[item("a", range, CADES)], Some(empty_crl(&pki)), &[&pki.root])[0];
    assert_eq!(verdict.integrity, Integrity::Altered);
    assert_eq!(verdict.status, SignatureStatus::Invalid);
    assert!(verdict.signer.is_some());
}

#[test]
fn a_wrong_message_digest_is_invalid() {
    let pki = pki();
    let (mut pdf, placeholder) = prepared_pdf();
    let range = fill_byte_range(&mut pdf, &placeholder).unwrap();
    let der = build_cms(&pki, ecdsa(Digest::Sha256), &sha256(b"another document"));
    embed_contents(&mut pdf, &placeholder, &der).unwrap();
    let verdict = &verify(&pdf, &[item("a", range, CADES)], None, &[&pki.root])[0];
    assert_eq!(verdict.integrity, Integrity::Altered);
    assert_eq!(verdict.status, SignatureStatus::Invalid);
}

#[test]
fn a_forged_signature_value_is_invalid() {
    let pki = pki();
    let other = ec_key();
    let (mut pdf, placeholder) = prepared_pdf();
    let range = fill_byte_range(&mut pdf, &placeholder).unwrap();
    let signer = Signer { certificate: &pki.leaf.cert, certificate_der: &pki.leaf.der, chain: &[], scheme: ecdsa(Digest::Sha256) };
    let digest = digest_range(&pdf, &range, Digest::Sha256).unwrap();
    let der = cms::build(&signer, &digest, |data| Ok(sign_with(&other, ecdsa(Digest::Sha256), data))).unwrap();
    embed_contents(&mut pdf, &placeholder, &der).unwrap();
    let verdict = &verify(&pdf, &[item("a", range, CADES)], None, &[&pki.root])[0];
    assert_eq!(verdict.integrity, Integrity::Altered);
}

#[test]
fn an_expired_certificate_reads_as_expired() {
    let pki = pki_with(ec_key(), (JAN_2020, JAN_2020 + YEAR));
    let (pdf, range) = signed_pdf(&pki, ecdsa(Digest::Sha256), |der| der);
    let verdict = &verify(&pdf, &[item("a", range, CADES)], Some(empty_crl(&pki)), &[&pki.root])[0];
    assert_eq!(verdict.integrity, Integrity::Intact);
    assert!(verdict.trusted, "{:?}", verdict.problems);
    assert_eq!(verdict.status, SignatureStatus::Expired);
}

#[test]
fn a_timestamp_inside_the_validity_keeps_an_expired_certificate_valid() {
    let pki = pki_with(ec_key(), (JAN_2020, JAN_2020 + YEAR));
    let signed_at = JAN_2020 + YEAR / 2;
    let (pdf, range) = signed_pdf(&pki, ecdsa(Digest::Sha256), |der| {
        let signature = cms::parse(&der).unwrap().signature().to_vec();
        cms::add_timestamp(&der, &timestamp_token(&pki.tsa, &sha256(&signature), None, signed_at)).unwrap()
    });
    let verdict = &verify(&pdf, &[item("a", range, CADES)], Some(empty_crl(&pki)), &[&pki.root])[0];
    assert_eq!(verdict.status, SignatureStatus::Valid, "{:?}", verdict.problems);
    let time = verdict.signing_time.as_ref().unwrap();
    assert_eq!(time.source, TimeSource::Timestamp);
    assert_eq!(time.authority.as_deref(), Some("Test TSA"));
    assert_eq!(time.time, super::util::iso_time(signed_at));
    assert_eq!(verdict.level, Some(PadesLevel::LongTerm));
}

#[test]
fn a_timestamp_for_another_signature_is_ignored() {
    let pki = pki();
    let (pdf, range) = signed_pdf(&pki, ecdsa(Digest::Sha256), |der| cms::add_timestamp(&der, &timestamp_token(&pki.tsa, &[9; 32], None, JAN_2020 + YEAR)).unwrap());
    let verdict = &verify(&pdf, &[item("a", range, CADES)], None, &[&pki.root])[0];
    assert_eq!(verdict.integrity, Integrity::Intact);
    assert_eq!(verdict.signing_time.as_ref().unwrap().source, TimeSource::Claimed);
    assert_eq!(verdict.level, Some(PadesLevel::Basic));
    assert_eq!(verdict.status, SignatureStatus::Unknown);
    assert_eq!(verdict.revocation, Revocation::Unknown);
}

#[test]
fn an_untrusted_chain_is_unverified() {
    let pki = pki();
    let stranger = issue(ec_key(), "Someone Else", 9, None, (JAN_2020 - YEAR, JAN_2020 + 20 * YEAR), Role::Authority);
    let (pdf, range) = signed_pdf(&pki, ecdsa(Digest::Sha256), |der| der);
    let verdict = &verify(&pdf, &[item("a", range, CADES)], Some(empty_crl(&pki)), &[&stranger])[0];
    assert_eq!(verdict.integrity, Integrity::Intact);
    assert!(!verdict.trusted);
    assert_eq!(verdict.status, SignatureStatus::Unverified);
    assert_eq!(verdict.revocation, Revocation::NotChecked);
}

#[test]
fn sha1_signatures_are_weak() {
    let pki = pki();
    let (pdf, range) = signed_pdf(&pki, ecdsa(Digest::Sha1), |der| der);
    let verdict = &verify(&pdf, &[item("a", range, CADES)], Some(empty_crl(&pki)), &[&pki.root])[0];
    assert_eq!(verdict.integrity, Integrity::Intact, "{:?}", verdict.problems);
    assert_eq!(verdict.digest_algorithm, "SHA-1");
    assert_eq!(verdict.status, SignatureStatus::Weak);
}

#[test]
fn rsa_keys_sign_through_the_digest_algorithm() {
    let pki = pki_with(rsa_key(2048), (JAN_2020, JAN_2020 + 15 * YEAR));
    let scheme = super::sign::scheme_for(&pki.leaf.cert).unwrap();
    assert_eq!(scheme, Scheme { padding: Padding::Pkcs1, digest: Digest::Sha256 });
    let (mut pdf, placeholder) = prepared_pdf();
    let range = fill_byte_range(&mut pdf, &placeholder).unwrap();
    let signer = Signer { certificate: &pki.leaf.cert, certificate_der: &pki.leaf.der, chain: &[], scheme };
    let digest = digest_range(&pdf, &range, scheme.digest).unwrap();
    let der = super::sign::signed_cms(&signer, &digest, |data| algorithms::sign(&pki.leaf.key.key, scheme, data), None).unwrap();
    embed_contents(&mut pdf, &placeholder, &der).unwrap();
    let verdict = &verify(&pdf, &[item("a", range, CADES)], Some(empty_crl(&pki)), &[&pki.root])[0];
    assert_eq!(verdict.status, SignatureStatus::Valid, "{:?}", verdict.problems);
    assert_eq!(verdict.signature_algorithm, "RSA with SHA-256");
}

#[test]
fn unsupported_sub_filters_are_reported() {
    let verdict = &verify(b"%PDF-1.7", &[item("a", [0, 1, 2, 3], "adbe.x509.rsa_sha1")], None, &[])[0];
    assert_eq!(verdict.status, SignatureStatus::Unsupported);
}

#[test]
fn ocsp_responses_are_checked() {
    let pki = pki();
    let link = pair(&pki.leaf, &pki.root);
    let good = ocsp_response(&pki.leaf, &pki.root, &pki.root, None);
    assert_eq!(revocation::ocsp_status(&good, &link, now()).unwrap(), Status::Good);
    let revoked = ocsp_response(&pki.leaf, &pki.root, &pki.root, Some(JAN_2020 + 10));
    assert_eq!(revocation::ocsp_status(&revoked, &link, JAN_2020 + 20).unwrap(), Status::Revoked(JAN_2020 + 10));
    assert_eq!(revocation::ocsp_status(&revoked, &link, JAN_2020).unwrap(), Status::Good);
    let other = ocsp_response(&pki.tsa, &pki.root, &pki.root, None);
    assert!(revocation::ocsp_status(&other, &link, now()).is_err());
    let forged = ocsp_response(&pki.leaf, &pki.root, &pki.tsa, None);
    assert!(revocation::ocsp_status(&forged, &link, now()).is_err());
    assert!(revocation::ocsp_request(&link).is_ok());
}

#[test]
fn crls_are_checked() {
    let pki = pki();
    let link = pair(&pki.leaf, &pki.root);
    assert_eq!(revocation::crl_status(&crl(&pki.root, &[]), &link, now()).unwrap(), Status::Good);
    let listed = crl(&pki.root, &[(&pki.leaf, JAN_2020 + 5)]);
    assert_eq!(revocation::crl_status(&listed, &link, now()).unwrap(), Status::Revoked(JAN_2020 + 5));
    assert!(revocation::crl_status(&crl(&pki.tsa, &[]), &link, now()).is_err());
}

#[test]
fn an_embedded_revocation_marks_the_signature_revoked() {
    let pki = pki();
    let (pdf, range) = signed_pdf(&pki, ecdsa(Digest::Sha256), |der| der);
    let material = Material { ocsps: vec![ocsp_response(&pki.leaf, &pki.root, &pki.root, Some(JAN_2020 + 10))], ..Material::default() };
    let verdict = &verify(&pdf, &[item("a", range, CADES)], Some(material), &[&pki.root])[0];
    assert_eq!(verdict.revocation, Revocation::Revoked);
    assert_eq!(verdict.status, SignatureStatus::Revoked);
}

#[test]
fn timestamp_replies_are_checked_against_the_request() {
    let pki = pki();
    let imprint = sha256(b"signature value");
    let nonce = tsa::new_nonce();
    let request = TimeStampReq::from_der(&tsa::request(&imprint, &nonce).unwrap()).unwrap();
    assert_eq!(request.message_imprint.hashed_message.as_bytes(), imprint.as_slice());
    assert!(request.cert_req);
    let reply = timestamp_reply(&timestamp_token(&pki.tsa, &imprint, Some(&nonce), JAN_2020));
    let token = tsa::accept(&reply, &imprint, &nonce).unwrap();
    assert_eq!(tsa::read_token(&token).unwrap().time, JAN_2020);
    assert!(tsa::accept(&reply, &imprint, &[1, 2, 3]).is_err());
    assert!(tsa::accept(&reply, &sha256(b"other"), &nonce).is_err());
    assert!(tsa::accept(b"not a reply", &imprint, &nonce).is_err());
}

#[test]
fn document_timestamps_seal_long_term_signatures() {
    let pki = pki();
    let signed_at = JAN_2020 + YEAR;
    let (mut pdf, first) = signed_pdf(&pki, ecdsa(Digest::Sha256), |der| {
        let signature = cms::parse(&der).unwrap().signature().to_vec();
        cms::add_timestamp(&der, &timestamp_token(&pki.tsa, &sha256(&signature), None, signed_at)).unwrap()
    });
    let placeholder = append_placeholder(&mut pdf);
    let second = fill_byte_range(&mut pdf, &placeholder).unwrap();
    let imprint = digest_range(&pdf, &second, Digest::Sha256).unwrap();
    embed_contents(&mut pdf, &placeholder, &timestamp_token(&pki.tsa, &imprint, None, signed_at + 60)).unwrap();
    let items = [item("sig", first, CADES), item("seal", second, RFC3161)];
    let verdicts = verify(&pdf, &items, Some(empty_crl(&pki)), &[&pki.root]);
    assert_eq!(verdicts[0].level, Some(PadesLevel::LongTermArchive), "{:?}", verdicts[0].problems);
    assert_eq!(verdicts[1].integrity, Integrity::Intact, "{:?}", verdicts[1].problems);
    assert_eq!(verdicts[1].status, SignatureStatus::Valid, "{:?}", verdicts[1].problems);
    assert_eq!(verdicts[1].signing_time.as_ref().unwrap().source, TimeSource::Timestamp);
    assert_eq!(verdicts[1].level, None);
    let mut tampered = pdf.clone();
    tampered[5] ^= 1;
    let verdicts = verify(&tampered, &items, Some(empty_crl(&pki)), &[&pki.root]);
    assert_eq!(verdicts[1].integrity, Integrity::Altered);
    assert_eq!(verdicts[0].integrity, Integrity::Altered);
}

#[test]
fn signing_checks_follow_the_plan() {
    let pki = pki();
    assert!(certs::signing_problems(&pki.leaf.cert, now()).is_empty());
    assert_eq!(certs::signing_problems(&pki.tsa.cert, now()).len(), 1);
    assert!(!certs::signing_problems(&pki.root.cert, now()).is_empty());
    assert!(!certs::signing_problems(&pki.leaf.cert, JAN_2020 + 16 * YEAR).is_empty());
    assert_eq!(certs::fingerprint(&pki.leaf.der).len(), 64);
    assert_eq!(certs::key_info(&pki.leaf.cert).unwrap().bits, 256);
    assert_eq!(ObjectIdentifier::new_unwrap("1.2.840.10045.2.1"), pki.leaf.cert.tbs_certificate.subject_public_key_info.algorithm.oid);
}

#[test]
fn a_signing_certificate_attribute_for_another_certificate_is_invalid() {
    let pki = pki();
    let (mut pdf, placeholder) = prepared_pdf();
    let range = fill_byte_range(&mut pdf, &placeholder).unwrap();
    let scheme = ecdsa(Digest::Sha256);
    let signer = Signer { certificate: &pki.leaf.cert, certificate_der: &pki.tsa.der, chain: &[], scheme };
    let digest = digest_range(&pdf, &range, Digest::Sha256).unwrap();
    let der = cms::build(&signer, &digest, |data| Ok(sign_with(&pki.leaf.key, scheme, data))).unwrap();
    embed_contents(&mut pdf, &placeholder, &der).unwrap();
    let verdict = &verify(&pdf, &[item("a", range, CADES)], None, &[&pki.root])[0];
    assert_eq!(verdict.integrity, Integrity::Altered);
    assert!(verdict.problems[0].contains("different certificate"));
}
