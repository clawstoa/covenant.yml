# Policy Catalog

This catalog dissects real-world AI contribution policies and maps each to an equivalent `covenant.yml` configuration. The purpose is twofold: to demonstrate the expressiveness of the Covenant v1 standard, and to provide ready-made policy templates for adoption.

For an updated cross-project list, see [open-source-ai-contribution-policies](https://github.com/melissawm/open-source-ai-contribution-policies).

---

## Stance Classification

| Stance | Meaning | Covenant Default |
|--------|---------|------------------|
| Accepting | AI-assisted contributions welcome with varying disclosure requirements | `defaults.unmatched: allow` or `warn` |
| Restricting | AI contributions permitted only with explicit approval or severe constraints | `defaults.unmatched: warn` with agent-specific `deny` rules |
| Rejecting | AI-generated contributions forbidden | `defaults.unmatched: deny` for agents |

---

## Additional Policy References

- [Homebrew](https://github.com/Homebrew/brew/tree/main): [(AI/LLM) usage](https://github.com/Homebrew/brew/blob/main/CONTRIBUTING.md#artificial-intelligencelarge-language-model-aillm-usage)
- [Firefox](https://github.com/mozilla-firefox/firefox): [Firefox AI Coding Policy](https://firefox-source-docs.mozilla.org/contributing/ai-coding.html)
- [Kornia](https://github.com/kornia/kornia/tree/main): [AI_POLICY.md](https://github.com/kornia/kornia/blob/main/AI_POLICY.md)

### Projects Severely Restricting AI Contributions

- [GNOME Extensions](https://gjs.guide/extensions/development/creating.html): [Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html#extensions-must-not-be-ai-generated)

---

## Accepting Projects

### Polars

- **Source**: [Contributing to Polars](https://docs.pola.rs/development/contributing/)
- **Stance**: Accepting
- **Summary**: Standard contribution process. No AI-specific restrictions. Contributors follow general guidelines without distinction between human and agent authorship.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: allow
rules:
  - id: agent-pr-open
    actor: agent
    action: pull_request.open
    outcome: allow
  - id: protect-human-threads
    actor: agent
    action: conversation.intervene_human_thread
    outcome: warn
```

---

### Matplotlib

- **Source**: [Matplotlib Contributing Guide](https://matplotlib.org/stable/devel/index.html)
- **Stance**: Accepting
- **Summary**: AI-assisted contributions accepted. Disclosure of AI involvement required. Human contributor remains accountable for correctness and quality.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: warn
requirements:
  on_failure: warn
  default_provenance_profile: disclosure
  provenance_profiles:
    disclosure:
      required_fields: [model, provider]
      on_failure: warn
rules:
  - id: agent-pr-with-disclosure
    actor: agent
    action: pull_request.open
    requirements:
      provenance_profile: disclosure
    outcome: warn
  - id: human-pr
    actor: human
    action: pull_request.open
    outcome: allow
  - id: protect-human-threads
    actor: agent
    action: conversation.intervene_human_thread
    outcome: deny
```

---

### SciPy

- **Source**: [SciPy Contributing Guide](https://scipy.github.io/devdocs/dev/contributor/contributor_toc.html)
- **Stance**: Accepting
- **Summary**: AI-assisted contributions permitted with disclosure. Contributors must identify AI involvement in their submissions.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: warn
requirements:
  on_failure: warn
  default_provenance_profile: disclosure
  provenance_profiles:
    disclosure:
      required_fields: [model, provider]
      on_failure: warn
rules:
  - id: agent-pr-with-disclosure
    actor: agent
    action: pull_request.open
    requirements:
      provenance_profile: disclosure
    outcome: allow
  - id: human-pr
    actor: human
    action: pull_request.open
    outcome: allow
  - id: protect-human-threads
    actor: agent
    action: conversation.intervene_human_thread
    outcome: warn
```

---

### Pandas

- **Source**: [Pandas Contributing Guide](https://pandas.pydata.org/docs/development/contributing.html)
- **Stance**: Accepting
- **Summary**: AI contributions welcome under standard review process. Human review applies equally to all submissions regardless of authorship method.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: warn
requirements:
  on_failure: warn
  default_provenance_profile: disclosure
  provenance_profiles:
    disclosure:
      required_fields: [model, provider]
      on_failure: warn
rules:
  - id: agent-pr-standard-review
    actor: agent
    action: pull_request.open
    requirements:
      provenance_profile: disclosure
    outcome: warn
  - id: human-pr
    actor: human
    action: pull_request.open
    outcome: allow
  - id: agent-issues
    actor: agent
    action: issue.open
    outcome: allow
  - id: protect-human-threads
    actor: agent
    action: conversation.intervene_human_thread
    outcome: deny
```

---

### Django

- **Source**: [Django Contributing Guide](https://docs.djangoproject.com/en/dev/internals/contributing/)
- **Stance**: Accepting
- **Summary**: AI-assisted contributions accepted. Human contributor bears full responsibility for submitted code quality, correctness, and security. Disclosure expected.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: warn
requirements:
  on_failure: deny
  default_provenance_profile: strict
  provenance_profiles:
    strict:
      required_fields: [model, provider, prompt_record, test_proof]
      on_failure: deny
rules:
  - id: agent-pr-strict
    actor: agent
    action: pull_request.open
    requirements:
      provenance_profile: strict
    outcome: warn
  - id: human-pr
    actor: human
    action: pull_request.open
    outcome: allow
  - id: agent-review-submit
    actor: agent
    action: pull_request.review.submit
    outcome: warn
  - id: agent-review-approve
    actor: agent
    action: pull_request.review.approve
    outcome: deny
  - id: protect-human-threads
    actor: agent
    action: conversation.intervene_human_thread
    outcome: deny
```

---

### CPython

- **Source**: [CPython Developer Guide](https://devguide.python.org/)
- **Stance**: Accepting
- **Summary**: AI use must be disclosed. Contributors must understand and verify all AI-generated output before submission. Standard review process applies.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: warn
requirements:
  on_failure: warn
  default_provenance_profile: disclosure
  provenance_profiles:
    disclosure:
      required_fields: [model, provider]
      on_failure: warn
rules:
  - id: agent-pr-with-disclosure
    actor: agent
    action: pull_request.open
    requirements:
      provenance_profile: disclosure
    outcome: warn
  - id: human-pr
    actor: human
    action: pull_request.open
    outcome: allow
  - id: protect-human-threads
    actor: agent
    action: conversation.intervene_human_thread
    outcome: deny
```

---

### LLVM

- **Source**: [LLVM Contributing Guide](https://llvm.org/docs/Contributing.html)
- **Stance**: Accepting
- **Summary**: Standard contribution and review process applies to all submissions. No AI-specific restrictions beyond standard quality expectations.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: allow
rules:
  - id: agent-pr-open
    actor: agent
    action: pull_request.open
    outcome: allow
  - id: agent-review
    actor: agent
    action: pull_request.review.submit
    outcome: allow
  - id: protect-human-threads
    actor: agent
    action: conversation.intervene_human_thread
    outcome: warn
```

---

## Restricting Projects

### NetBSD

- **Source**: [NetBSD AI Policy](https://mail-index.netbsd.org/tech-kern/2023/02/01/msg028680.html)
- **Stance**: Restricting
- **Summary**: AI-generated contributions require explicit core team approval. No autonomous agent submissions permitted without prior authorization. Human oversight mandatory.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: deny
actors:
  managers:
    - id: core-team
      match:
        usernames: [netbsd-core]
requirements:
  on_failure: deny
  default_provenance_profile: strict
  provenance_profiles:
    strict:
      required_fields: [model, provider, prompt_record, test_proof]
      on_failure: deny
attestation:
  contract: covenant.attestation.v1
  max_age_seconds: 900
  nonce_ttl_seconds: 3600
  on_failure: deny
enforcement:
  deny:
    - type: comment
      message: Covenant denied for ${actor} on ${action}. Core team approval required for AI contributions. reason=${reason_codes}
    - type: fail_status
      context: covenant/policy
      description: AI contribution requires core team pre-approval
rules:
  - id: manager-override
    actor: manager
    action: '*'
    outcome: allow
  - id: human-pr
    actor: human
    action: pull_request.open
    outcome: allow
  - id: human-issues
    actor: human
    action: issue.*
    outcome: allow
  - id: deny-agent-pr
    actor: agent
    action: pull_request.*
    outcome: deny
  - id: deny-agent-merge
    actor: agent
    action: pull_request.merge
    outcome: deny
  - id: block-agent-threads
    actor: agent
    action: conversation.intervene_human_thread
    outcome: deny
```

---

## Rejecting Projects

### Gentoo Linux

- **Source**: [Gentoo AI Policy](https://wiki.gentoo.org/wiki/Project:Council/AI_policy)
- **Stance**: Rejecting
- **Summary**: AI-generated contributions are explicitly forbidden. All contributions must be human-authored. No exceptions for any agent type.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: deny
enforcement:
  deny:
    - type: comment
      message: This repository does not accept AI-generated contributions. action=${action} by ${actor}. reason=${reason_codes}
    - type: fail_status
      context: covenant/policy
      description: AI contributions are not accepted
    - type: close_pull_request
rules:
  - id: human-all
    actor: human
    action: '*'
    outcome: allow
  - id: deny-agent-all
    actor: agent
    action: '*'
    outcome: deny
```

---

### Linux man-pages

- **Source**: [man-pages AI Policy](https://lore.kernel.org/all/217f7b21-47ba-4a7e-bed5-869f2dbf16ebn@googlegroups.com/)
- **Stance**: Rejecting
- **Summary**: No AI-generated content accepted. Documentation must be human-authored to ensure accuracy and editorial quality.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: deny
enforcement:
  deny:
    - type: comment
      message: AI-generated content is not accepted in this project. reason=${reason_codes}
    - type: fail_status
      context: covenant/policy
      description: AI content not accepted
rules:
  - id: human-all
    actor: human
    action: '*'
    outcome: allow
  - id: deny-agent-all
    actor: agent
    action: '*'
    outcome: deny
```

---

### GoToSocial

- **Source**: [GoToSocial Contributing Guide](https://github.com/superseriousbusiness/gotosocial/blob/main/CONTRIBUTING.md)
- **Stance**: Rejecting
- **Summary**: Explicit ban on AI-generated contributions. Project maintains a strict human-only authorship policy.

```yaml
spec_version: 1.0.0
defaults:
  unmatched: deny
enforcement:
  deny:
    - type: comment
      message: AI-generated contributions are explicitly prohibited. reason=${reason_codes}
    - type: close_pull_request
    - type: fail_status
      context: covenant/policy
      description: AI contributions prohibited
rules:
  - id: human-all
    actor: human
    action: '*'
    outcome: allow
  - id: deny-agent-all
    actor: agent
    action: '*'
    outcome: deny
```

---

## Policy Comparison Matrix

Some projects in this matrix are sourced from [open-source-ai-contribution-policies](https://github.com/melissawm/open-source-ai-contribution-policies). For an updated cross-project list, see [open-source-ai-contribution-policies](https://github.com/melissawm/open-source-ai-contribution-policies).

| Project | PRs | Reviews | Issues | Human Threads | Provenance | Attestation |
|---------|-----|---------|--------|---------------|------------|-------------|
| [Polars](https://docs.pola.rs/development/contributing/) | allow | allow | allow | warn | none | none |
| [Matplotlib](https://matplotlib.org/stable/devel/index.html) | warn | warn | allow | deny | model, provider | none |
| [SciPy](https://scipy.github.io/devdocs/dev/contributor/contributor_toc.html) | allow | warn | allow | warn | model, provider | none |
| [Pandas](https://pandas.pydata.org/docs/development/contributing.html) | warn | warn | allow | deny | model, provider | none |
| [Django](https://docs.djangoproject.com/en/dev/internals/contributing/) | warn | warn (no approve) | warn | deny | strict (all fields) | none |
| [CPython](https://devguide.python.org/) | warn | warn | warn | deny | model, provider | none |
| [LLVM](https://llvm.org/docs/Contributing.html) | allow | allow | allow | warn | none | none |
| [NetBSD](https://mail-index.netbsd.org/tech-kern/2023/02/01/msg028680.html) | deny | deny | deny | deny | strict | required |
| [Gentoo](https://wiki.gentoo.org/wiki/Project:Council/AI_policy) | deny | deny | deny | deny | n/a (all denied) | n/a |
| [man-pages](https://lore.kernel.org/all/217f7b21-47ba-4a7e-bed5-869f2dbf16ebn@googlegroups.com/) | deny | deny | deny | deny | n/a | n/a |
| [GoToSocial](https://github.com/superseriousbusiness/gotosocial/blob/main/CONTRIBUTING.md) | deny | deny | deny | deny | n/a | n/a |

---

## Contributing a Policy

To submit a new policy dissection, open an issue using the **Policy Submission** template. Include the project name, source URL, stance, and proposed `covenant.yml` mapping. Submitted policies are validated against the Covenant.yml v1.0.0 schema before acceptance.
