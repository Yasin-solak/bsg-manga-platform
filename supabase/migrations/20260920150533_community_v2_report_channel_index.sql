-- Server/channel delete and access queries use a full index on the composite foreign key.
create index community_reports_server_channel on community_v2.message_reports(server_id,channel_id);
