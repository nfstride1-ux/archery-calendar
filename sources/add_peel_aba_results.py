#!/usr/bin/env python3
"""Branch J ABA State Titles, Peel Archers, 24-25 Oct 2026 (event aba-2026-097): results transcribed from the
organiser's results sheet (two photos). ABA numbers are left out; Cub/Junior archers are first name + initial only.
Checks every row: the four rounds add up to the total (DNS/DNF count as 0)."""
import json, datetime, re
EID = 'aba-2026-097'
# (group label, [(first, surname, division on sheet, [3A,1A,3A,1A], total, place)], show per-row division?)
B = [
 ('AFFU - Grade B', [('Maree','Munrowd','AFFU',[350,324,358,350],1382,'1')]),
 ('AFFU - Grade C', [('Renee','Kryzysztofik','AFFU',[286,188,280,218],972,'1')]),
 ('AMBH (C) - Grade A', [('Dave','Hancock','AMBH (C)',[342,370,334,380],1426,'1'),('Ken','Neill','AMBH (C)',[312,266,330,284],1192,'2')]),
 ('AMBH (C) - Grade B', [('Pat','Hayes','AMBH (C)',[302,224,258,150],934,'1')]),
 ('AMBH (R) - Grade A', [('Jorma','Merilainen','AMBH (R)',[284,340,324,282],1230,'1'),('Andrew','Sturman','AMBH (R)',[308,278,310,312],1208,'2'),('Alan','Bender','AMBH (R)',[310,288,320,262],1180,'3'),('Dan','Petty','AMBH (R)',[318,236,310,210],1074,'')]),
 ('AMBH (R) - Grade B', [('Vesa','Tiikkainew','AMBH (R)',[242,208,304,264],1018,'1')]),
 ('AMBU - Grade A', [('Jacob','Damstra','AMBU',[360,386,384,386],1516,'1'),('Joel','Outram','AMBU',[374,374,368,336],1452,'2')]),
 ('AMBU - Grade B', [('Steven','Barker','AMBU',[370,380,388,366],1504,'1'),('Kholeho','Botes','AMBU',[364,366,362,342],1434,'2'),('Hein','Botes','AMBU',[356,356,366,342],1420,'3'),('John','Hekkens','AMBU',[390,354,'DNF','DNF'],744,'')]),
 ('AMBU - Grade C', [('Peter','Muir','AMBU',[342,310,340,322],1314,'1'),('Jamie','Holl','AMBU',[328,290,328,316],1262,'2'),('Laurie','Cooper','AMBU',[316,280,324,320],1240,'3'),('David','Budarick','AMBU',[310,268,328,266],1172,''),('John','Mitchell','AMBU',[332,248,348,240],1168,'')]),
 ('AMFU - Grade A', [('Lee','Kirkup','AMFU',[380,366,384,388],1518,'1'),('Rob','McCulloch','AMFU',[370,346,386,384],1486,'2'),('Scott','Way','AMFU',[372,348,384,378],1482,'3')]),
 ('AMFU - Grade B', [('Phillip','Bodey','AMFU',[368,388,392,372],1520,'1'),('Glenn','Newell','AMFU',[358,364,382,374],1478,'2'),('Wayne','Caldwell','AMFU',[376,360,388,350],1474,'3'),('Morgan','Reimers','AMFU',[376,380,362,346],1464,''),('Jaron','Deacon','AMFU',[378,362,376,338],1454,'')]),
 ('AMLB (M) - Grade A', [('Luke','Hanson','AMLB (M)',[292,232,312,308],1144,'1')]),
 ('AMLB (M) - Grade C', [('Jaco','Rabe','AMLB (M)',[248,150,'DNS','DNS'],398,'')]),
 ('CMBH (R) - Grade C (Cub)', [('Mason','Cooper','CMBH (R)',[138,148,242,134],662,'1')]),
 ('JMBU - Grade C (Junior)', [('Angus','Budarick','JMBU',[274,184,306,272],1036,'1')]),
 ('TBA', [('Nate','Evans','TBA',[400,400,400,400],1600,'1'),('Dana','Chapman-Burney','TBA',[398,400,400,400],1598,'2'),('Estiaan','Cronje','TBA',[398,396,400,398],1592,'3'),('Robert','Timms','TBA',[398,396,400,396],1590,''),('Nathaniel','Stride','TBA',[382,376,398,400],1556,''),('Cyrus','Tokhfifi','TBA',[386,390,384,384],1544,''),('Josh','Coffey','TBA',[372,388,390,390],1540,''),('Everett','Young','TBA',[376,378,386,386],1526,''),('Doug','Bourman','TBA',[370,370,374,374],1488,''),('Nat','Neeson','TBA',[368,344,360,360],1432,''),('Danie','Oosthuizen','TBA',[398,400,'DNS','DNS'],798,''),('Reggie','von Jaasveld','TBA',[400,394,'DNS','DNS'],794,''),('Troy','Morris','TBA',['DNS','DNS',386,386],772,''),('Steve','Fraser','TBA',[372,378,'DNF','DNF'],750,''),('Heine','Klegnhang','TBA',[332,284,'DNS','DNS'],616,'')]),
 ('TBA - Junior', [('Tahuri','Engelen-Burney','TBA',[398,394,394,390],1576,'1')]),
 ('TMBH (R) and TFBH (R)', [('Glenn','Edwards','TMBH (R)',[342,332,368,258],1300,'1'),('Jeffrey','Pye','TMBH (R)',[336,300,304,304],1244,'2'),('Jenny','Fox','TFBH (R)',[344,280,342,234],1200,'3')]),
 ('TFLB (T) and TMLB (T)', [('Ilse','Gosper','TFLB (T)',[272,198,250,220],940,'1'),('Paul','van den Dries','TMLB (T)',[240,190,284,212],926,'2'),('Angelique','Bowald','TFLB (T)',[278,142,266,200],886,'3')]),
]
JUNIOR = ('CMBH', 'JMBU', 'Junior')
groups = []; n = 0
for label, rows in B:
    out = []; mixed = ' and ' in label
    for f, s, div, sc, tot, pl in rows:
        assert sum(x for x in sc if isinstance(x, int)) == tot, (f, s, sc, tot)
        young = label.startswith(('CMBH', 'JMBU')) or 'Junior' in label
        name = f"{f} {s[0]}." if young else f"{f} {s}"
        r = {'place': pl, 'name': name, 'round': 'Rounds: ' + ' / '.join(str(x) for x in sc)}
        if mixed: r['division'] = div
        out.append(r | {'score': str(tot)}); n += 1
    groups.append({'division': label, 'rows': out})
json.dump({'groups': groups}, open(f'data/results/{EID}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
D = json.load(open('data/results.json'))
D['results'][EID] = {'kind': 'full', 'title': 'Results by division and grade (four rounds: 3A, 1A, 3A, 1A)', 'source_name': 'ABA Branch J results sheet (Peel Archers)', 'source_url': 'https://www.bowhunters.org.au/aba-shoot-calendar/', 'note': 'Transcribed from the results sheet handed out at the shoot. Division codes are as printed on the sheet. Cub and Junior archers show first name and initial only. DNS = did not shoot, DNF = did not finish.', 'checked': datetime.date.today().isoformat(), 'n': n, 'ng': len(groups), 'split': True}
json.dump(D, open('data/results.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(n, len(groups))
