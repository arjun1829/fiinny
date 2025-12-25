import re

path = "c:/lifemap/website/app/page.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Fix opening tags with leading space: < section -> <section
content = re.sub(r'<\s+([a-zA-Z0-9]+)', r'<\1', content)

# Fix closing tags with trailing space: </section > -> </section>
content = re.sub(r'</([a-zA-Z0-9]+)\s+>', r'</\1>', content)

# Fix attributes: id = "..." -> id="..." (Optional but good)
# content = re.sub(r'\s+=\s+"', '="', content) 

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed JSX tags in " + path)
