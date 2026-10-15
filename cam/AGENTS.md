# Integrated Rockwood Cam

Cam capture and report modules were imported from rockwood-walkthrough at 2354167.
New visits use this app's Supabase project, authenticated pm_members and canonical
pm_projects IDs. The older app/database remain the archive for legacy visits.

Keep source evidence and stable visit/report IDs. Client writes use cam_save_visit
and cam_archive_visit; workspace roles and source revision checks are authoritative.
The shared AWS worker processes this database using a separate server-side connection.
Do not put its service key in this web application. PDF links require workspace login.
Email and automatic project/task changes remain disabled.
