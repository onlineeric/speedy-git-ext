# Commit Signature Verification

Speedy Git checks each commit's signature using **only your local Git
installation** — it never contacts GitHub or any other server. So what you see
depends entirely on the keys and trust settings configured on *this* machine.

> **Why this differs from GitHub:** GitHub may show a green **Verified** badge for
> a commit that Speedy Git reports as *not verified*. GitHub trusts keys uploaded
> to the author's account; your machine trusts only keys in your local trust
> stores. Until you set up local trust (see [Setup](#setup-local-verification)),
> some commits GitHub calls "Verified" will show as **Signed, not verified
> locally** here. That's expected.

---

## What you'll see

The **commit details panel** shows the full, precise state:

| State | Meaning |
|-------|---------|
| **Verified** | Good signature from a key you trust. |
| **Bad Signature** | The signature doesn't match the commit — it may have been tampered with. |
| **Signed, signer's public key not trusted** *(GPG)* | Valid signature, but the key is in your keyring without enough trust. |
| **Signed, signer's public key not in your keyring** *(GPG)* | A signature exists, but you don't have the key to check it — import the signer's public key. |
| **Signed, signer not in your allowedSignersFile** *(SSH)* | A signature exists, but the signer isn't listed in your `allowedSignersFile`. |
| **Signed, expired or revoked** | The signature or its key has expired or been revoked. |
| **Signed, not verified locally** | The commit is signed, but Git can't reach a verdict — most often an SSH signature with no `allowedSignersFile`. |
| **No signature** | The commit isn't signed. |

### Signature column (optional)

The history list can show a **Signature** column that collapses every state above
into one of three quick-scan glyphs:

| Glyph | Means | States it covers |
|-------|-------|------------------|
| ✅ | Verified | Good, trusted signature. |
| ⚠️ | Problem | Bad signature. |
| ❓ | Can't verify locally | Signed, but not verifiable — any **Signed, …** state above. |
| *(blank)* | Unsigned | No signature. |

Enable it from the commit-list column settings (the columns popover). It's hidden
by default and costs nothing while hidden.

---

## Setup: local verification

To turn ❓ **Can't verify locally** into ✅ **Verified**, give Git the keys it
needs to trust. The steps differ for SSH and GPG signatures.

### SSH-signed commits

Git can sign commits with your existing SSH key instead of a GPG key.

**1. Sign your own commits** (optional — skip if you only want to *verify* others):

```bash
# Bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
```

```powershell
# PowerShell
git config --global gpg.format ssh
git config --global user.signingkey "$env:USERPROFILE/.ssh/id_ed25519.pub"
git config --global commit.gpgsign true
```

`user.signingkey` points to your **public** key (`.pub`); Git uses the matching
private key from the same folder. Upload that public key to GitHub if you also want
remote **Verified** badges.

**2. Tell Git which signers to trust** — verification needs an *allowed signers*
file listing the keys you trust. Add one line per author you want verified:

```bash
# Bash — one entry per line: <email> <public-key>
echo "you@example.com $(cat ~/.ssh/id_ed25519.pub)" >> ~/.ssh/allowed_signers
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```

```powershell
# PowerShell — one entry per line: <email> <public-key>
Add-Content "$env:USERPROFILE\.ssh\allowed_signers" "you@example.com $(Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub")"
git config --global gpg.ssh.allowedSignersFile "$env:USERPROFILE\.ssh\allowed_signers"
```

Without this file, SSH-signed commits stay at **Signed, not verified locally**.

**3. Confirm:**

```bash
git log --show-signature -1
```

### GPG-signed commits

To verify GPG signatures, import the signer's public key and mark it trusted.

Commits made through the GitHub web UI (merges, edits, suggestions) are signed with
GitHub's **`web-flow`** key — import and trust it to verify those:

```bash
# Bash
curl https://github.com/web-flow.gpg | gpg --import

# Raise its trust level in the interactive editor:
gpg --edit-key 4AEE18F83AFDEB23   # web-flow key id
#   gpg> trust  →  choose 4 (full) or 5 (ultimate)  →  quit
```

```powershell
# PowerShell
$webFlowKey = Join-Path $env:TEMP "web-flow.gpg"
Invoke-WebRequest -Uri "https://github.com/web-flow.gpg" -OutFile $webFlowKey
gpg --import $webFlowKey

# Raise its trust level in the interactive editor:
gpg --edit-key 4AEE18F83AFDEB23   # web-flow key id
#   gpg> trust  →  choose 4 (full) or 5 (ultimate)  →  quit
```

Import and trust other authors' keys the same way. Once a key is trusted, commits
signed by it show **Verified**.

---

## Why a commit still won't verify

- **Verification tool not installed** — GPG signatures need `gpg`, and SSH
  signatures need OpenSSH 8.1+ (`ssh-keygen`), available on your `PATH`.
- **Key only on another machine** — the author signed with a key you haven't
  imported or trusted locally.
- **SSH signature with no `allowedSignersFile`** — see the [SSH setup](#ssh-signed-commits) above.
- **Expired or revoked key** — re-import an updated key if the author rotated it.
- **GitHub-only trust** — GitHub verifies against account-uploaded keys you may not
  have; set up local trust to match.

Verification here always reflects your **local** Git trust configuration.
