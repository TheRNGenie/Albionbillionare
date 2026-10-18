import xml.etree.ElementTree as E, html, re, json, sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
raw = open(sys.argv[1]).read()
if raw.lstrip().startswith('{'):  # a saved Claude Docs read result
    d = json.loads(raw); raw = d.get('data', d).get('xml') or d['data']['xml']
r = E.fromstring(raw)
esc = html.escape

def inline(el):
    out = []
    if el.text: out.append(esc(el.text))
    for c in el:
        t = c.tag
        if t == 'text': out.append(inline(c))
        elif t == 'bold': out.append('<strong>' + inline(c) + '</strong>')
        elif t == 'link': out.append(f'<a href="{esc(c.get("href"))}" target="_blank" rel="noopener">' + inline(c) + '</a>')
        elif t == 'code': out.append('<code>' + inline(c) + '</code>')
        elif t == 'date': out.append('Oct 18, 2026')
        elif t == 'mention': out.append('Logan')
        else: out.append(inline(c))
        if c.tail: out.append(esc(c.tail))
    return ''.join(out)

def para(p):
    s = inline(p).strip()
    return s

def block(el):
    t = el.tag
    if t == 'paragraph':
        s = para(el)
        if not s: return ''
        # bold-only paragraph acts as a mini heading
        kids = [c for c in el]
        if len(kids) == 1 and len(kids[0]) == 1 and kids[0][0].tag == 'bold' and not (kids[0].text or '').strip():
            return f'<h4 class="mini">{inline(kids[0][0])}</h4>'
        return f'<p>{s}</p>'
    if t == 'list':
        tag = 'ol' if el.get('kind') == 'ordered' else 'ul'
        items = []
        for li in el:
            items.append('<li>' + ''.join(block(c) if c.tag != 'paragraph' else para(c) for c in li) + '</li>')
        return f'<{tag}>' + ''.join(items) + f'</{tag}>'
    if t == 'table':
        rows = []
        head = None
        for row in el:
            cells = list(row)
            ishead = all(c.get('header') == 'true' for c in cells)
            vals = ['<br>'.join(x for x in (para(p) for p in c if p.tag == 'paragraph') if x) for c in cells]
            if ishead and head is None:
                head = '<tr>' + ''.join(f'<th>{v}</th>' for v in vals) + '</tr>'
            else:
                plain = re.sub('<[^>]+>', '', vals[0] if vals else '')
                cls = []
                if len(vals) > 1 and re.sub('<[^>]+>', '', vals[1]).strip() == 'Silver': cls.append('silver')
                if vals and re.match(r'^\d\. ', plain): cls.append('stop')
                c = f' class="{" ".join(cls)}"' if cls else ''
                rows.append(f'<tr{c}>' + ''.join(f'<td>{v}</td>' for v in vals) + '</tr>')
        return '<div class="tw"><table>' + (f'<thead>{head}</thead>' if head else '') + '<tbody>' + ''.join(rows) + '</tbody></table></div>'
    if t == 'codeBlock':
        return '<div class="formula">focus per craft = base focus × 0.5<sup>efficiency / 10,000</sup></div>'
    if t == 'embed':
        ref = el.get('ref', '')
        key = 'CHART' if '3a8d66bd' in ref else 'DIAGRAM'
        return f'<figure class="fig">%%{key}%%<figcaption>{esc(el.get("caption",""))}</figcaption></figure>'
    return ''

META = {
 'The pick': ('pick', 'The pick', 'Plan'),
 'Your spec': ('spec', 'Your spec', 'Plan'),
 'The route': ('route', 'Route by stage', 'Plan'),
 'Daily loop': ('loop', 'Jacket loop', 'Loops'),
 'Plate helmet': ('helmets', 'Plate helmet loop', 'Loops'),
 'Perfect Loop': ('perfect', 'Perfect Loop', 'Plan'),
 'Daily shopping': ('shopping', 'Shopping list', 'Loops'),
 'Refining your own': ('refine', 'Refine your leather', 'Refining'),
 'Refining loop for profit': ('bars', 'Metal bar loop', 'Refining'),
 'Refining with a Transport': ('mammoth', 'Mammoth refining', 'Refining'),
 'Price sheet': ('prices', 'Price sheet', 'Reference'),
 'Why it beats': ('why', 'Why leather', 'Reference'),
 'The mechanics': ('mechanics', 'Mechanics', 'Reference'),
 'Daily routine': ('routine', 'What to expect', 'Reference'),
 'Risks': ('risks', 'Risks', 'Reference'),
 'Sources': ('sources', 'Sources', 'Reference'),
}
secs = []; cur = None; sub = None; title = ''
for el in r:
    if el.tag == 'paragraph' and el.get('heading') == '1':
        title = ''.join(el.itertext()); continue
    if el.tag == 'paragraph' and el.get('heading') == '2':
        h = ''.join(el.itertext())
        m = next(v for k, v in META.items() if h.startswith(k))
        cur = dict(id=m[0], nav=m[1], group=m[2], h=h, body=[], subs=[]); secs.append(cur); sub = None; continue
    if el.tag == 'paragraph' and el.get('heading') == '3':
        h = ''.join(el.itertext())
        sub = dict(h=h, body=[]); cur['subs'].append(sub); continue
    if cur is None: continue
    b = block(el)
    if b: (sub['body'] if sub else cur['body']).append(b)
json.dump(dict(title=title, secs=secs), open(os.path.join(HERE, 'content.json'), 'w'))
print(title, [(s['id'], len(s['body']), len(s['subs'])) for s in secs])
