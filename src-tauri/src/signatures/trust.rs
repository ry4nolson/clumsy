use core_foundation::date::CFDate;
use security_framework::certificate::SecCertificate;
use security_framework::policy::SecPolicy;
use security_framework::trust::SecTrust;

const MAC_EPOCH_OFFSET: f64 = 978_307_200.0;

#[derive(Clone, Debug, Default)]
pub struct TrustOptions {
    pub online: bool,
    pub fetch_issuers: bool,
    pub anchors: Vec<Vec<u8>>,
}

#[derive(Clone, Debug, Default)]
pub struct TrustResult {
    pub trusted: bool,
    pub chain: Vec<Vec<u8>>,
}

pub fn evaluate(certificates: &[Vec<u8>], at: i64, options: &TrustOptions) -> TrustResult {
    let parsed: Vec<SecCertificate> = certificates.iter().filter_map(|der| SecCertificate::from_der(der).ok()).collect();
    if parsed.is_empty() {
        return TrustResult::default();
    }
    let Ok(mut trust) = SecTrust::create_with_certificates(&parsed, &[SecPolicy::create_x509()]) else {
        return TrustResult::default();
    };
    let _ = trust.set_network_fetch_allowed(options.online && options.fetch_issuers);
    let _ = trust.set_trust_verify_date(&CFDate::new(at as f64 - MAC_EPOCH_OFFSET));
    if !options.anchors.is_empty() {
        let anchors: Vec<SecCertificate> = options.anchors.iter().filter_map(|der| SecCertificate::from_der(der).ok()).collect();
        let _ = trust.set_anchor_certificates(&anchors);
        let _ = trust.set_trust_anchor_certificates_only(true);
    }
    let outcome = trust.evaluate_with_error();
    let chain = trust.chain().iter().map(SecCertificate::to_der).collect();
    TrustResult { trusted: outcome.is_ok(), chain }
}
