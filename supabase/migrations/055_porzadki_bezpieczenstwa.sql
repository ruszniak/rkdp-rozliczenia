-- Porządki po przeglądzie bezpieczeństwa: stały search_path w funkcjach, funkcje wyzwalaczy niewywoływalne przez API
alter function public.client_files_guard() set search_path = public;
alter function public.jwt_session_id() set search_path = public;
alter function public.jwt_has_method(text) set search_path = public;
alter function public.login_mode() set search_path = public;
alter function public.fin_statements_touch() set search_path = public;
alter function public.period_comments_guard() set search_path = public;
alter function public.shared_docs_guard() set search_path = public;
revoke execute on function public.push_on_comment() from public, anon, authenticated;
revoke execute on function public.push_on_mention() from public, anon, authenticated;
revoke execute on function public.push_on_ticket() from public, anon, authenticated;
revoke execute on function public.zlecenie_on_comment() from public, anon, authenticated;
revoke execute on function public.zlecenie_on_insert() from public, anon, authenticated;
revoke execute on function public.m2_write_history() from public, anon, authenticated;
revoke execute on function public.rkdp_ticket_created() from public, anon, authenticated;
revoke execute on function public.rkdp_ticket_track() from public, anon, authenticated;
revoke execute on function public.partner_entries_touch() from public, anon, authenticated;
revoke execute on function public.clients_resync_entries() from public, anon, authenticated;
