-- Spotkania z klientami (nie prywatne) widzą też osoby z pełnym dostępem tylko do M2 TAX (np. Marcin)
CREATE OR REPLACE FUNCTION public.meeting_visible(p_id uuid, p_private boolean, p_created_by uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.current_member_id() is not null and (
    p_created_by = public.current_member_id()
    or exists (select 1 from public.meeting_members mm where mm.meeting_id = p_id and mm.member_id = public.current_member_id())
    or (not p_private and (public.is_admin() or coalesce(public.current_role_name() in ('admin','full'), false))));
$function$;
