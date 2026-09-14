"""Password-backed Plesk transport; credentials stay in the ignored VS Code SFTP file."""

import json
import sys
from pathlib import Path

try:
    import paramiko
except ImportError as error:
    raise SystemExit("Install the local deploy dependency: python -m pip install -r requirements-deploy.txt") from error


ROOT = Path(__file__).resolve().parent.parent
SETTINGS = ROOT / ".vscode" / "sftp.json"
TRUSTED_HOST = "goldengeek.org"
PRIVATE_APP = "/var/www/vhosts/goldengeek.org/flywindow-app/"


def remote_script(client, script, label):
    stdin, stdout, stderr = client.exec_command("sh -s", timeout=80)
    stdin.write(script)
    stdin.flush()
    stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", "replace").strip()
    err = stderr.read().decode("utf-8", "replace").strip()
    code = stdout.channel.recv_exit_status()
    if out:
        print(out)
    if err:
        print(err, file=sys.stderr)
    if code:
        raise RuntimeError(f"{label} failed on the server (exit {code}).")


def main():
    payload = json.load(sys.stdin)
    settings = json.loads(SETTINGS.read_text(encoding="utf-8-sig"))
    host = settings["host"]
    user = settings.get("username") or settings.get("user")
    password = settings["password"]
    port = int(settings.get("port", 22))
    if settings.get("protocol") != "sftp" or not user or not password:
        raise ValueError(".vscode/sftp.json needs an SFTP host, username and password.")
    if not payload["remoteArchive"].startswith(PRIVATE_APP):
        raise ValueError("Release archive must be uploaded into the private app directory.")

    known = paramiko.HostKeys()
    known.load(str(Path.home() / ".ssh" / "known_hosts"))
    trusted = known.lookup(host) or known.lookup(TRUSTED_HOST)
    if not trusted:
        raise ValueError("SSH host key is not trusted. Verify it and connect once with ssh goldengeek.org first.")

    client = paramiko.SSHClient()
    for key in trusted.values():
        client.get_host_keys().add(host, key.get_name(), key)
    try:
        client.connect(host, port=port, username=user, password=password,
                       look_for_keys=False, allow_agent=False, timeout=12,
                       auth_timeout=12)
        print("Authenticated to Plesk; checking private app...")
        remote_script(client, payload["preflight"], "Preflight")
        print("Uploading release to the private app directory...")
        sftp = client.open_sftp()
        try:
            sftp.put(payload["archive"], payload["remoteArchive"], confirm=True)
        finally:
            sftp.close()
        print("Installing and restarting Node...")
        remote_script(client, payload["install"], "Install")
    finally:
        client.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        raise SystemExit(f"Plesk transport stopped: {error}") from None
