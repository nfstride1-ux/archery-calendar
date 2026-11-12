# Row-level security for replacing an event flyer.
# Rebuilds a throwaway database and runs scripts/flyer_rls_test.sql (which applies supabase/flyer_replace_rls.sql).
import os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(ROOT, 'scripts', 'flyer_rls_test.sql')

def psql(sql, db='postgres'):
    return subprocess.run(['sudo', '-u', 'postgres', 'psql', '-d', db, '-v', 'ON_ERROR_STOP=1', '-c', sql],
                          cwd=ROOT, text=True, capture_output=True)

drop = psql('DROP DATABASE IF EXISTS flyer_rls;')
if drop.returncode != 0:
    sys.stderr.write(drop.stderr or drop.stdout)
    sys.exit(drop.returncode)
make = psql('CREATE DATABASE flyer_rls;')
if make.returncode != 0:
    sys.stderr.write(make.stderr or make.stdout)
    sys.exit(make.returncode)
run = subprocess.run(['sudo', '-u', 'postgres', 'psql', '-d', 'flyer_rls', '-v', 'ON_ERROR_STOP=1', '-f', SQL],
                     cwd=ROOT, text=True, capture_output=True)
sys.stdout.write(run.stdout)
sys.stderr.write(run.stderr)
if run.returncode != 0:
    sys.exit(run.returncode)
print('PASS flyer RLS: admins and approved editors can insert and replace; strangers and anon cannot')
