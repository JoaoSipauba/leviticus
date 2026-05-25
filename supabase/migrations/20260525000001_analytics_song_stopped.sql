-- Adiciona 'song_stopped' ao CHECK de event_type. Aditivo: app antigo não
-- emite, app novo sim. Aggregator do dashboard soma played_seconds tanto
-- de song_completed (fim natural) quanto de song_stopped (parada parcial).

alter table analytics_events
  drop constraint analytics_events_event_type_check;

alter table analytics_events
  add constraint analytics_events_event_type_check check (event_type in (
    'app_opened',
    'song_played',
    'song_completed',
    'download_succeeded',
    'download_failed',
    'culto_started',
    'song_stopped'
  ));
