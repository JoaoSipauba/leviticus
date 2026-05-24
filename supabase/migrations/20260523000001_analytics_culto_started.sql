-- Expande o CHECK de event_type para aceitar 'culto_started'.
-- Aditivo: app antigo não emite, app novo sim. RLS já cobre.

alter table analytics_events
  drop constraint analytics_events_event_type_check;

alter table analytics_events
  add constraint analytics_events_event_type_check check (event_type in (
    'app_opened',
    'song_played',
    'song_completed',
    'download_succeeded',
    'download_failed',
    'culto_started'
  ));
