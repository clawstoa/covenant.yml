# GitHub Adapter Mapping

Covenant v1 reference adapter maps GitHub events to canonical actions.

| GitHub event | GitHub action | Covenant action |
|---|---|---|
| `issues` | `opened` | `issue.open` |
| `issues` | `closed` | `issue.solve` |
| `issues` | `labeled`, `unlabeled` | `issue.label` |
| `issue_comment` | `created`, `edited` | `issue.comment` |
| `pull_request` | `opened` | `pull_request.open` |
| `pull_request` | `reopened`, `synchronize`, `edited` | `pull_request.update` |
| `pull_request` | `closed` with `merged=true` | `pull_request.merge` |
| `pull_request_review` | `submitted` with `approved` | `pull_request.review.approve` |
| `pull_request_review` | `submitted` non-approve | `pull_request.review.submit` |
| `pull_request_review_comment` | `created` | `pull_request.review.submit` |
| `discussion_comment` | `created` and `thread:human` label | `conversation.intervene_human_thread` |
| `discussion_comment` | `created` otherwise | `conversation.intervene_agent_thread` |

Unsupported combinations return `supported=false` and reason code `github.event.unsupported`.
