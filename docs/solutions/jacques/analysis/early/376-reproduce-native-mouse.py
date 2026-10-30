from pathlib import Path
import re, json, subprocess, hashlib, shutil, difflib
root=Path(__file__).resolve().parents[5]; out=Path('/tmp/jacques-early-376-native-live');out.mkdir(exist_ok=True)
source=(root/'legacy_c/oracle/oracle_main.cpp').read_text()
s=source.replace('#include "../','#include "'+str(root/'legacy_c')+'/')
old='    return FALSE;\n}\n\nint parse_input_spec'
new='    char* end = NULL;\n    long numeric = std::strtol(token.c_str(), &end, 10);\n    if (end && *end == \'\\0\' && numeric >= CmdMoveFirst && numeric <= CmdMoveLast) { *cmd = static_cast<int>(numeric); return TRUE; }\n    return FALSE;\n}\n\nint parse_input_spec'
assert old in s;s=s.replace(old,new,1)
old='    std::printf("],\\\"result\\\":{\\\"status\\\":");'
new='    std::printf("],\\\"recordedMoves\\\":");\n    print_moves_json(currentgamestate()->moves);\n    std::printf(",\\\"result\\\":{\\\"status\\\":");'
assert old in s;s=s.replace(old,new,1)
(out/'oracle-main-mouse.cpp').write_text(s)
(out/'oracle-parser.patch').write_text(''.join(difflib.unified_diff(source.splitlines(True),s.splitlines(True),fromfile='original/oracle_main.cpp',tofile='temporary/oracle-main-mouse.cpp')))
commands=[]
def run(args,**kw):
 commands.append([str(a) for a in args]);return subprocess.run(args,check=True,timeout=30,**kw)
run(['/usr/bin/c++','-g','-std=gnu++11','-arch','arm64','-DSAVEDIR="./save"','-Dstricmp=strcasecmp','-I',str(root/'legacy_c'),'-c',str(out/'oracle-main-mouse.cpp'),'-o',str(out/'oracle-main-mouse.o')])
objs=[p for p in (root/'build-verify/legacy_c/CMakeFiles/tworld-oracle.dir').glob('*.o')]
run(['/usr/bin/c++','-g','-arch','arm64',str(out/'oracle-main-mouse.o'),*[str(p)for p in objs],'-o',str(out/'tworld-oracle-mouse')])
for d in ['sets','data','save']:(out/d).mkdir(exist_ok=True)
shutil.copyfile('/Users/joshuabone/Downloads/Jacques.dat',out/'data/Jacques.dat');(out/'sets/Jacques-MS.dac').write_text('file=Jacques.dat\nruleset=ms\n')
a=json.loads(Path(__file__).with_name('376-mouse-live-inputs.json').read_text())['inputs'];names={1:'n',2:'w',4:'s',8:'e'}
spec=','.join(f'{i}:{"preserve" if i in [743,744,745] else names.get(v,str(v))}'for i,v in enumerate(a)if v or i in[743,744,745])
(out/'schedule.txt').write_text(spec+'\n')
args=[str(out/'tworld-oracle-mouse'),'--root',str(root),'--series-dir',str(out/'sets'),'--data-dir',str(out/'data'),'--save-dir',str(out/'save'),'input-trace','Jacques-MS.dac','376',spec,'1000','67']
r=run(args,capture_output=True,text=True);(out/'native-live-trace.json').write_text(r.stdout);(out/'native-live-stderr.txt').write_text(r.stderr);t=json.loads(r.stdout)
assert t['result']=={'status':'completed','finalTick':920,'stepCount':921},t['result']
assert {'when':742,'dir':177} in t['recordedMoves'];assert not any(m['dir'] in[3,5,6,7,9,10,11,12,13,14,15]for m in t['recordedMoves'])
# Compile the real native OS-input module with headless hardware, then use its actual viewport hit test.
native=root/'legacy_c/generic';inp=(root/'web/src/player-web/impl/testSupport/nativeInputOracle.c').read_text();keys=sorted(set(re.findall(r'\bTWK_\w+', (native/'in.c').read_text()))-{'TWK_LAST'})
(out/'oshwbind.h').write_text('#include <stdint.h>\nenum { TWK_FIRST = 256, '+', '.join(keys)+', TWK_LAST };\nenum { TW_BUTTON_LEFT=1, TW_BUTTON_WHEELUP=4, TW_BUTTON_WHEELDOWN=5 };\ntypedef struct { int x,y,w,h; } TW_Rect;\ntypedef struct { int unused; } TW_Surface;\nuint8_t *TW_GetKeyState(int *count);\n')
inp=inp.replace("case 'N': key = TWK_UP; break;", "case 'M': mouseeventcallback(16, 80, TW_BUTTON_LEFT, TRUE); continue;\n            case 'N': key = TWK_UP; break;")
inp=inp.replace('geng.eventupdatefunc = deliver_events;', 'geng.eventupdatefunc = deliver_events;\n    geng.wtile = 32; geng.htile = 32;\n    geng.maploc.x = 0; geng.maploc.y = 0;\n    geng.mapvieworigin = 32 * CXGRID * 4; /* x0,y8, from native view before tick742 */')
(out/'native-mouse-input.c').write_text(inp)
run(['cc','-std=c99','-I',str(out),'-I',str(native),str(out/'native-mouse-input.c'),'-o',str(out/'input-oracle-mouse')])
poll=run([str(out/'input-oracle-mouse')],input='M\n-\n-\n-\n-\n',capture_output=True,text=True)
values=list(map(int,poll.stdout.split()));assert values[0]==832 and len(set(values[1:4]))==1 and values[-1]==0,values
summary={'level':376,'nativeManualResult':t['result'],'nativeRecorderMouse':{'when':742,'dir':177},'nativeRecorderMoves':t['recordedMoves'],'nativeInputPollCodes':values,'absoluteMouseCommand':832,'target':{'x':0,'y':10},'viewportAtTick741':t['steps'][741]['view'],'beforeTick742':t['steps'][741]['chip'],'afterTick742':t['steps'][742]['chip'],'nativeStderr':r.stderr,'inputOracleStderr':poll.stderr,'implementationNote':'Temporary oracle CLI parser accepts numeric live commands and exposes the existing native move recorder. It links unchanged original engine/play objects. Real generic/in.c handles mouse event, viewport hit testing, and preserve polls.','commands':commands}
(out/'evidence.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items()if k not in['commands','nativeRecorderMoves']},indent=2))
