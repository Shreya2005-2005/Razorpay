import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// WSL2 reassigns its LAN IP on every restart, so detect it fresh each time
// `next dev` starts instead of hardcoding one — avoids re-editing this file
// whenever the address changes.
function currentLanIPs(): string[] {
  const addresses: string[] = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family === "IPv4" && !info.internal) {
        addresses.push(info.address);
      }
    }
  }
  return addresses;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: currentLanIPs(),
};

export default nextConfig;
