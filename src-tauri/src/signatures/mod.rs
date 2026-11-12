use std::collections::HashMap;
use std::sync::Mutex;

#[cfg(target_os = "macos")]
mod algorithms;
#[cfg(target_os = "macos")]
mod certs;
#[cfg(target_os = "macos")]
mod cms;
#[cfg(target_os = "macos")]
mod commands;
#[cfg(target_os = "macos")]
mod http;
#[cfg(target_os = "macos")]
mod identities;
#[cfg(target_os = "macos")]
mod ipc;
#[cfg(target_os = "macos")]
mod panel;
#[cfg(target_os = "macos")]
mod pdf;
#[cfg(target_os = "macos")]
mod revocation;
#[cfg(target_os = "macos")]
mod sign;
#[cfg(all(test, target_os = "macos"))]
mod test_pki;
#[cfg(all(test, target_os = "macos"))]
mod tests;
#[cfg(target_os = "macos")]
mod trust;
#[cfg(target_os = "macos")]
mod tsa;
#[cfg(target_os = "macos")]
mod types;
#[cfg(target_os = "macos")]
mod util;
#[cfg(target_os = "macos")]
mod validation;
#[cfg(target_os = "macos")]
mod verify;

#[cfg(not(target_os = "macos"))]
mod unsupported;

#[cfg(target_os = "macos")]
pub use commands::*;
#[cfg(not(target_os = "macos"))]
pub use unsupported::*;

const REMEMBERED_CHAINS: usize = 256;

#[derive(Default)]
pub struct SeenCertificates(Mutex<HashMap<String, Vec<Vec<u8>>>>);

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
impl SeenCertificates {
    fn remember(&self, chain: Vec<Vec<u8>>) {
        let Some(leaf) = chain.first() else { return };
        let fingerprint = sha256_hex(leaf);
        let mut chains = crate::lock(&self.0);
        if chains.len() >= REMEMBERED_CHAINS && !chains.contains_key(&fingerprint) {
            chains.clear();
        }
        chains.insert(fingerprint, chain);
    }

    fn chain(&self, fingerprint: &str) -> Option<Vec<Vec<u8>>> {
        crate::lock(&self.0).get(&fingerprint.to_ascii_uppercase()).cloned()
    }
}

#[cfg(target_os = "macos")]
fn sha256_hex(der: &[u8]) -> String {
    certs::fingerprint(der)
}

#[cfg(not(target_os = "macos"))]
fn sha256_hex(_der: &[u8]) -> String {
    String::new()
}
