use mac_address::get_mac_address;
use serde::Serialize;

#[derive(Serialize)]
pub struct MacInfo {
    pub mac:     String,
    pub display: String, // formatted as AA:BB:CC:DD:EE:FF
}

/// Returns the MAC address of the primary network interface.
///
/// Uses the `mac_address` crate which reads from:
///   Windows  — GetAdaptersAddresses() Win32 API
///   macOS    — getifaddrs()
///   Linux    — /sys/class/net/<iface>/address
///
/// Returns "unknown" if no interface is found (e.g. VM with no adapter).
/// MAC randomisation (macOS 12+ Wi-Fi privacy) only affects Wi-Fi scanning,
/// NOT the actual interface MAC used here — so this is stable per-machine.
#[tauri::command]
pub async fn get_mac_address_cmd() -> Result<MacInfo, String> {
    match get_mac_address() {
        Ok(Some(ma)) => {
            let bytes   = ma.bytes();
            let raw     = format!("{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
                bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
            let display = format!("{:02X}:{:02X}:{:02X}:{:02X}:{:02X}:{:02X}",
                bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
            Ok(MacInfo { mac: raw, display })
        }
        Ok(None) => Ok(MacInfo {
            mac:     "unknown".to_string(),
            display: "unknown".to_string(),
        }),
        Err(e) => Err(format!("mac_address error: {e}")),
    }
}
