import json, html, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
C = json.load(open(os.path.join(HERE, 'content.json')))
ORDER = ['pick','perfect','spec','route','loop','helmets','shopping','refine','bars','mammoth','prices','why','mechanics','routine','risks','sources']
secs = {s['id']: s for s in C['secs']}
GROUPS = ['Plan','Loops','Refining','Reference']

# chart
roy = [('Apr',4.26),('May',2.80),('Jun',4.50),('Jul',2.39),('Aug',1.78),('Sep',2.81),('Oct*',4.24)]
bm = [9.48,7.63,7.61,5.73,5.37,6.31,6.94]
L,R,Y0,B = 56,560,24,236
x = lambda i: L + i*(R-L)/6
y = lambda v: B - v/10*(B-Y0)
g = ''.join(f'<line x1="{L}" x2="{R}" y1="{y(t):.1f}" y2="{y(t):.1f}" class="grid"/><text x="{L-8}" y="{y(t)+4:.1f}" text-anchor="end" class="ax">{t}M</text>' for t in (0,2,4,6,8,10))
xl = ''.join(f'<text x="{x(i):.1f}" y="{B+20}" text-anchor="middle" class="ax">{m}</text>' for i,(m,_) in enumerate(roy))
def series(vals, cls, label):
    pts = ' '.join(f'{x(i):.1f},{y(v):.1f}' for i,v in enumerate(vals))
    dots = ''.join(f'<circle cx="{x(i):.1f}" cy="{y(v):.1f}" r="4" class="{cls}-f"><title>{label}, {roy[i][0]}: {v:.2f}M a day</title></circle>' for i,v in enumerate(vals))
    return f'<polyline points="{pts}" class="{cls}-l"/>{dots}<text x="{R+10}" y="{y(vals[-1])+4:.1f}" class="{cls}-t">{label}</text>'
chart = (f'<svg viewBox="0 0 720 268" role="img" aria-label="Net profit per day by month">{g}{xl}'
    + series([v for _,v in roy],'s1','Royal cities only') + series(bm,'s2','With Black Market')
    + f'<text x="{x(4):.1f}" y="{y(1.78)+20:.1f}" text-anchor="middle" class="lbl">low 1.78M</text></svg>'
    + '<p class="note">Net profit per day, millions of silver, spec 50, 20M of materials a day. * October covers Oct 1 to 16 only.</p>')

# loop diagram
W,H,ra,rb,c1,c2,c3 = 216,88,20,160,132,380,628
def box(cx,yy,title,lines,main=False):
    t = f'<rect x="{cx-W/2}" y="{yy}" width="{W}" height="{H}" rx="6" class="{"bx main" if main else "bx"}"/>'
    t += f'<text x="{cx-W/2+12}" y="{yy+24}" class="bt">{title}</text>'
    for i,(s,q) in enumerate(lines): t += f'<text x="{cx-W/2+12}" y="{yy+44+16*i}" class="{"bq" if q else "bl"}">{html.escape(s)}</text>'
    return t
arr = 'marker-end="url(#ar)"'
diag = ('<svg viewBox="0 0 760 270" role="img" aria-label="Daily loop through five royal cities">'
 '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arh"/></marker></defs><g class="con">'
 f'<path d="M{c1+W/2} {ra+H/2}H{c2-W/2}" {arr}/><path d="M{c2+W/2} {ra+H/2}H{c3-W/2}" {arr}/><path d="M{c3} {ra+H}V{rb}" {arr}/>'
 f'<path d="M{c3-W/2} {rb+H/2}H{c2+W/2}" {arr}/><path d="M{c2-W/2} {rb+H/2}H{c1}V{ra+H}" {arr}/></g>'
 + box(c1,ra,'1. Martlock (start)',[("Buy T3 and T4.3 leather",0),("Refine yesterday's hides",0),("no focus, 36.7% comes back",1)],True)
 + box(c2,ra,'2. Thetford',[("From Stage 2: buy T4.1 and",0),("T5.1 leather here",0),("Craft: focus crafts first",0)])
 + box(c3,ra,'3. Fort Sterling',[("Sell T4.2 Assassin Jackets",0),("Buy half of the T4 hides",0)])
 + box(c3,rb,'4. Lymhurst',[("Sell T4.1 and T4.3 Assassin,",0),("T4.2 Mercenary Jackets",0),("Buy the other half",0)])
 + box(c2,rb,'5. Bridgewatch',[("Sell T4.1 Merc, T5.1 jackets",0),("From Stage 2: buy T5.1 hides",0),("Carry hides to Martlock",0)])
 + f'<text x="24" y="{rb+40}" class="bq">Blue and yellow zones only:</text><text x="24" y="{rb+56}" class="bq">you can\'t lose the load</text></svg>')

FIELDS = {
 'm':('Leather Armor Crafter',100),'a':('Assassin Jacket',100),'r':('Mercenary Jacket',100),'h':('Hunter Jacket',100),'f':('Focus per day',30000),
 'pm':('Plate Helmet Crafter',100),'pg':('Guardian Helmet',100),'ps':('Soldier Helmet',100),'pk':('Knight Helmet',100),
 't4':('Tanner T4',100),'t5':('Tanner T5',100),'t6':('Tanner T6',100),
 's4':('Smelter T4',100),'s5':('Smelter T5',100),'s6':('Smelter T6',100)}
PANEL = {
 'spec':('jacket-full',['m','a','r','h','f'],None,'The doc text below this box was written for 63 / 41 / 16 / 0.'),
 'loop':('jacket',['m','a','r','h','f'],None,'Same spec as the Your spec page; changing it here changes it everywhere.'),
 'helmets':('helmet',['pm','pg','ps','pk'],('hl','I run this loop'),'Jacket focus crafts get your focus first; whatever is left goes to the craft below that adds the most per focus point.'),
 'refine':('leather',['t4','t5','t6'],None,'Refining spec is per tier: 30 per level of every tier you have, plus 250 per level of the tier you refine.'),
 'bars':('bars',['s4','s5','s6'],('bl','I run this loop'),'Counts are Lap 1 of the loop below. Refining spec is per tier: 30 per level of every tier, plus 250 per level of the tier you refine.'),
}
def panel(sec):
    out, keys, chk, note = PANEL[sec]
    f = ''.join(f'<label>{FIELDS[k][0]}<input id="sp-{k}-{sec}" data-k="{k}" type="number" min="0" max="{FIELDS[k][1]}" step="{500 if k=='f' else 1}" inputmode="numeric"></label>' for k in keys)
    if chk: f += f'<label class="chk"><input id="sp-{chk[0]}-{sec}" data-k="{chk[0]}" type="checkbox"> {chk[1]}</label>'
    if sec == 'spec': f += '<button type="button" class="ghost sp-reset">Use 63 / 41 / 16</button>'
    return f'<div class="calc"><div class="calc-in">{f}</div><div class="calc-out" data-out="{out}"></div><p class="note">Updates as you type and is remembered on this device. {note}</p></div>'

def fill(s): return s.replace('%%CHART%%', chart).replace('%%DIAGRAM%%', diag)

nav = []
for gname in GROUPS:
    items = ''.join(f'<a href="#{i}" data-go="{i}" class="nv">{html.escape(secs[i]["nav"])}</a>' for i in ORDER if secs[i]['group']==gname)
    nav.append(f'<div class="ng"><div class="ngl">{gname}</div>{items}</div>')

body = []
for i in ORDER:
    s = secs[i]
    inner = (panel(i) if i in PANEL else '') + ''.join(fill(b) for b in s['body'])
    if s['subs']:
        tabs = ''.join(f'<button type="button" class="tab" id="tab-{i}-{k}" data-sub="{k}" role="tab">{html.escape(sb["h"].split(" loop:")[0])}<span class="here" data-stage="{k}" hidden>You</span><small>{html.escape(sb["h"].split(": ",1)[-1])}</small></button>' for k,sb in enumerate(s['subs']))
        panes = ''.join(f'<div class="pane" data-pane="{k}"><h3>{html.escape(sb["h"])}</h3>' + ''.join(fill(b) for b in sb['body']) + '</div>' for k,sb in enumerate(s['subs']))
        inner += f'<div class="tabs" role="tablist">{tabs}</div>{panes}'
    body.append(f'<section class="sec" id="{i}" data-nav="{html.escape(s["nav"])}"><div class="eyebrow">{s["group"]}</div><h2>{html.escape(s["h"])}</h2>{inner}</section>')

glance = '''<div class="glance">
<div class="gl"><span>Your stage</span><b id="g-stage">Stage 2</b><em id="g-spec">Crafter 63 · Assassin 41 · Merc 16</em></div>
<div class="gl"><span>Jacket loop</span><b id="g-prof">2.78M / day</b><em>estimate, royal cities, 20M of materials</em></div>
<a class="gl gl-link gl-main" href="#perfect" data-go="perfect"><span>Your plan · Perfect Loop</span><b>6.5M / day</b><em>jackets 3.8M + helmets 2.7M, Elder's Ox</em></a>
<a class="gl gl-link" href="#spec" data-go="spec"><span>Daily focus · edit spec</span><b id="g-focus">5 × T4.3 Assassin</b><em id="g-focus2">1,760 focus each at your spec</em></a>
</div>'''

tpl = open(os.path.join(HERE, 'shell.html')).read()
out = tpl.replace('%%NAV%%', ''.join(nav)).replace('%%BODY%%', ''.join(body)).replace('%%GLANCE%%', glance)
open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'crafting-plan.html'),'w').write(out)
print(len(out))
