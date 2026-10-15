# Integrated Rockwood Cam

Cam capture and report modules were imported from rockwood-walkthrough at 2354167.
Field entry is name + phone, with no visible signup, email, password or OTP.
A separate anonymous Supabase session owns each browser’s field visits. Never reuse
its token for workspace enrollment or store it in the workspace auth storage key.
Workspace report links may reuse an already signed-in workspace member for review.

Canonical pm_projects IDs connect visits to the shared property inbox. Field sessions
receive only Cam contributor access; they can choose real non-archived properties,
save their own visits and read their own media/report jobs. Workspace members retain
review access through their roles. The old app/database remain the legacy archive.

Keep source evidence, name/phone attribution and stable visit/report IDs. Contact
information is self-reported, not a verified identity or cross-device lookup key.
Client writes use cam_save_visit and cam_archive_visit; server and database checks
and revision conflicts remain authoritative. Private media stays private.
The shared AWS worker processes this database with a separate server connection.
Do not put its service key in the web application. Email and automatic task changes
remain disabled. Never remove the workspace login to fix field capture.
