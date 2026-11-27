# Home Gateway

Home Gateway is an independent dashboard for a local sing-box gateway. It is based on [SagerNet/sing-box-dashboard](https://github.com/SagerNet/sing-box-dashboard) at commit `3e4bf08e5bf5b9417cf9c36e5a2d5abcb21bdd34`. The Gateway API integration targets sing-box 1.14.5.

Open **Gateway** to authenticate with the management service on the dashboard origin at `/api/gateway/`. The Gateway keeps your sign-in for the browser tab session, including page reloads. Use **Sign out of gateway** to clear it. Register each device by LAN IPv4 address or by MAC address, give it a name and an optional label, then choose its route. New entries use the normal sing-box rules. An IP rule follows the address when DHCP reassigns it. A MAC rule follows the address seen on the gateway's LAN. Each card shows the confirmed route and links to tracked connections when its IP and the matching native server are available. Connections that bypass sing-box are outside this stream.

To edit a configuration, load the editable sections, make changes, and validate them. Review the diff of server-masked values before applying and restarting. The server preserves masked credentials when their placeholders are left intact. Restart and restore actions are available on the Gateway page even if the native API is temporarily down. The management service and reverse proxy must be running.

## Build and release

Use Node 22 and the pnpm version pinned in `package.json`. Initialize Git submodules, then run `pnpm install --frozen-lockfile`, `pnpm generate`, `pnpm test` and `pnpm build`. Serve the contents of `dist/` below `/dashboard/`.

A `gateway-v*` release tag runs the same checks and produces a zip with the contents of `dist/`, including `build-info.json` with source revisions and the target core version. The private gateway configuration, device inventory and administrator credential are supplied separately on the server. For upgrades, merge the new upstream commit into a topic branch and review a pull request in this fork. Update the recorded upstream revision and verify group selection, the connection filter, device routing and DNS before tagging a release. Keep the previous verified static release available when updating.

## LICENSE

```
Copyright (C) 2022 by nekohasekai <contact-sagernet@sekai.icu>

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <http://www.gnu.org/licenses/>.

In addition, no derivative work may use the name or imply association
with this application without prior consent.
```
