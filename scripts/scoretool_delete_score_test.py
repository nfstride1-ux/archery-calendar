# Contract check for scoretool_delete_score() in supabase/scoretool_scores.sql.
# Does not talk to the live database. Fake ids only.
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sql = open(os.path.join(ROOT, 'supabase', 'scoretool_scores.sql'), encoding='utf-8').read()
ok, bad = [], []
def chk(n, c):
    (ok if c else bad).append(n)
    print(('PASS ' if c else 'FAIL ') + n, flush=True)

m = re.search(r'create or replace function public\.scoretool_delete_score\(p_token text, p_source_id text\)\s+returns jsonb.*?end \$\$;', sql, re.S)
chk('scoretool_delete_score is in scoretool_scores.sql', bool(m))
body = m.group(0) if m else ''
chk('rejects a token that is not 48 hex chars', "p_token !~ '^[0-9a-f]{48}$'" in body)
chk('looks up the linked user from the token hash, not a raw token', 'token_hash = extensions.digest(p_token, \'sha256\')' in body)
chk('deletes only that user\'s scoretool row for p_source_id',
    'delete from public.score_entries where user_id = uid and source = \'scoretool\' and source_id = p_source_id;' in body)
chk('does not delete by user_id alone', not re.search(r'delete from public.score_entries where user_id = uid;', body))
chk('source_id length is checked (1-80)', 'char_length(p_source_id) < 1 or char_length(p_source_id) > 80' in body)
chk('anon and authenticated can execute it',
    'grant execute on function public.scoretool_delete_score(text, text) to anon, authenticated;' in sql)
chk('public execute is revoked',
    'revoke all on function public.scoretool_delete_score(text, text) from public;' in sql)
chk('PROJECT_RULES names the delete function',
    'scoretool_delete_score()' in open(os.path.join(ROOT, 'PROJECT_RULES.md'), encoding='utf-8').read())
print(f'\n{len(ok)} passed, {len(bad)} failed')
sys.exit(1 if bad else 0)
