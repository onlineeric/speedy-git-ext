# Commit Signature Verification

Speedy Git shows each commit's cryptographic signature status using **only your
local Git installation** — it never contacts GitHub or any other host. That means
verification depends entirely on the keys and trust settings configured on *this*
machine.

> **Local vs. GitHub:** GitHub may display a green **Verified** badge for a commit
> that your local machine reports as *not verified*. GitHub trusts keys uploaded to
> the author's account; your machine only trusts keys in your local trust stores.
> Until you configure local trust (below), expect some commits GitHub calls
> "Verified" to show as **Signed, not verified locally** here. This is normal.

---

## What each state means

The **commit details panel** shows the full, precise state:

| State | Meaning |
|-------|---------|
| **Verified** | Good signature from a key you trust. |
| **Bad Signature** | The signature does not match the commit — it may have been tampered with. |
| **Signed, signer's public key not trusted** (GPG) / **Signed, signer not in your allowedSignersFile** (SSH) | Valid signature, but the signing key isn't trusted locally — for GPG it's in your keyring but not trusted; for SSH the signer isn't listed in your `allowedSignersFile`. |
| **Signed, signer's public key not in your keyring** (GPG) / **Signed, signer not in your allowedSignersFile** (SSH) | A signature exists, but you don't have the key to check it — import the signer's GPG public key, or add them to your SSH `allowedSignersFile`. |
| **Signed, expired or revoked** | The signature or its key has expired or been revoked. |
| **Signed, not verified locally** | The commit is signed, but your machine can't produce a verdict (commonly SSH signatures with no `allowedSignersFile`). |
| **No signature** | The commit carries no signature. |

The optional **Signature history column** groups these into three glyphs for quick
scanning:

- ✅ **Verified** — good, trusted signature.
- ⚠️ **Problem** — bad signature.
- ❓ **Cannot verify** — signed, but not verifiable locally (any of the "Signed, …"
  states above).
- *(blank)* — unsigned commits show nothing.

Enable the column from the commit-list settings (the columns popover); it is hidden
by default and adds zero cost while hidden.

---

## Setting up local verification

### SSH-signed commits

If commits are signed with SSH keys, Git needs an **allowed signers** file to know
which keys to trust:

```bash
# Create/append an entry: <email> <public-key>
echo "you@example.com $(cat ~/.ssh/id_ed25519.pub)" >> ~/.ssh/allowed_signers

# Tell Git where it lives
git config --global gpg.ssh.allowedSignersFile ~/.ssh/allowed_signers
```

Add a line for every author whose SSH signatures you want verified. Without this
file, SSH-signed commits show **Signed, not verified locally**.

Confirm with:

```bash
git log --show-signature -1
```

### GPG-signed commits

To verify GPG-signed commits you must import and trust the signer's public key.

For commits made through the GitHub web UI (merges, edits, etc.), import GitHub's
**`web-flow`** key and mark it trusted:

```bash
# Import GitHub's web-flow GPG key
curl https://github.com/web-flow.gpg | gpg --import

# Then raise its trust level (4 = full) in the interactive editor:
gpg --edit-key 4AEE18F83AFDEB23  # web-flow key id
#   gpg> trust   → choose 4 (or 5 = ultimate) → quit
```

For other authors, import their public key the same way and set an appropriate
trust level. Once a key is trusted, commits signed by it show **Verified**.

---

## Why a commit might still not verify

- **Different key on another machine** — the author signed with a key you haven't
  imported/trusted locally.
- **SSH signatures without `allowedSignersFile`** — see the SSH section above.
- **Expired or revoked keys** — re-import an updated key if the author rotated it.
- **GitHub-only verification** — GitHub verifies against account-uploaded keys you
  may not have locally; configure local trust to match.

Verification here always reflects your **local** Git trust configuration.
