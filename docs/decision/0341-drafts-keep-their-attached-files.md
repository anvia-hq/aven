# A draft keeps its attached files

Status: accepted. Supersedes the last bullet of 0209 (a draft's attached files are not saved).

## Context

The composer of a thread keeps its text and mentions in localStorage (0209). An attached file lived in memory only: the record is JSON, a `File` does not serialise, and one draft may carry up to 10 MB of files while localStorage holds about 5 MB of strings — with a quota error that `safeStorage` swallows, so the first big pasted screenshot could also stop the text from being kept. A reload lost the screenshot pasted into a half-written message, which is the case the draft exists for.

## Decision

- **The draft record is versioned and names its files.** `aven.thread.<id>.draft` holds `{ v, input, entities, files }`, each file as `{ id, name, type, size }`. A record written before this has no `v` and no files: it is read as version 0 and rewritten on the next change.
- **The bytes go to IndexedDB** (`aven.drafts`, a `files` store keyed by thread and file, indexed on the thread), the only browser store that keeps a `File` and megabytes. Nothing is stored as base64 in localStorage.
- **A draft of files and no text is a draft**: the record is kept while either the text or the files remain, and is removed when both are gone.
- **Files are kept as they are attached, and deleted when they are removed, when their message is sent, and when the person signs out.** A browser that refuses the write keeps the file in memory and says so once; the text is still kept. A file whose bytes are gone is dropped from the tiles and from the record.
- **A page load sweeps the files no draft names**, so bytes whose record was lost do not stay forever.
- **A draft stays on the device until it is sent**: files still travel in the message as base64 (0034), and the composer of a new thread, which has no id yet, is still not saved (0209).

## Consequences

- A draft can hold the 10 MB a message may carry. IndexedDB may still refuse or evict (a private window, a full disk): the text is then kept and the files are not.
- Drafts of deleted threads keep their files, as their text already was.
- Two tabs on one thread each keep their own composer: the last write wins, as for the text; a file one tab removes is deleted for both, though the other tab shows its tile until it reloads.
- A record localStorage refuses to write (its quota is full) leaves the files only until the next reload, as the text would be.
- The sweep runs once per page load, before the first composer restores; files added after it are kept for the session.
