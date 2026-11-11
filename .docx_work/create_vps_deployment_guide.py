from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path("/Users/ziczouczac/Desktop/DEV/BACKYARD")
OUTPUT = ROOT / "docs" / "Guide-deploiement-production-VPS-Ubuntu-Nginx.docx"

NAVY = "16324F"
PALE_BLUE = "EAF2F8"
PALE_GRAY = "F3F4F6"
MID_GRAY = "D9D9D9"
TEXT_GRAY = RGBColor(70, 75, 82)


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=110, start=130, bottom=110, end=130) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for margin, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{margin}"))
        if node is None:
            node = OxmlElement(f"w:{margin}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")


def set_table_borders(table, color=MID_GRAY, size="6") -> None:
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.first_child_found_in("w:tblBorders")
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), size)
        tag.set(qn("w:space"), "0")
        tag.set(qn("w:color"), color)


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_repeat_table_rows(table) -> None:
    set_repeat_table_header(table.rows[0])
    for row in table.rows:
        tr_pr = row._tr.get_or_add_trPr()
        cant_split = OxmlElement("w:cantSplit")
        cant_split.set(qn("w:val"), "true")
        tr_pr.append(cant_split)
        for cell in row.cells:
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            set_cell_margins(cell)


def set_font(run, name: str, size: float | None = None, bold: bool | None = None, color=None) -> None:
    run.font.name = name
    run._element.get_or_add_rPr().rFonts.set(qn("w:ascii"), name)
    run._element.get_or_add_rPr().rFonts.set(qn("w:hAnsi"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = color


def add_page_number(paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = paragraph.add_run("Page ")
    set_font(run, "Aptos", 9, color=TEXT_GRAY)
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    instr_text = OxmlElement("w:instrText")
    instr_text.set(qn("xml:space"), "preserve")
    instr_text.text = " PAGE "
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run._r.extend([fld_char1, instr_text, fld_char2])


def add_hyperlink(paragraph, text: str, url: str) -> None:
    part = paragraph.part
    rel_id = part.relate_to(url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), rel_id)
    run = OxmlElement("w:r")
    r_pr = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), NAVY)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    r_pr.extend([color, underline])
    text_node = OxmlElement("w:t")
    text_node.text = text
    run.extend([r_pr, text_node])
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def keep_with_next(paragraph) -> None:
    paragraph.paragraph_format.keep_with_next = True


def add_heading(doc: Document, text: str, level: int = 1):
    p = doc.add_heading(text, level=level)
    keep_with_next(p)
    return p


def add_body(doc: Document, text: str, bold_lead: str | None = None):
    p = doc.add_paragraph()
    if bold_lead and text.startswith(bold_lead):
        first = p.add_run(bold_lead)
        first.bold = True
        p.add_run(text[len(bold_lead):])
    else:
        p.add_run(text)
    return p


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.add_run(item)


def add_numbers(doc: Document, items: list[str]) -> None:
    for index, item in enumerate(items, start=1):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.3)
        p.paragraph_format.first_line_indent = Inches(-0.22)
        p.paragraph_format.space_after = Pt(3)
        number = p.add_run(f"{index}. ")
        number.bold = True
        p.add_run(item)


def add_code(doc: Document, code: str, label: str | None = None) -> None:
    if label:
        p_label = doc.add_paragraph()
        p_label.paragraph_format.space_before = Pt(4)
        p_label.paragraph_format.space_after = Pt(3)
        run = p_label.add_run(label)
        set_font(run, "Aptos", 9.5, bold=True, color=TEXT_GRAY)
        keep_with_next(p_label)
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.16)
    p.paragraph_format.right_indent = Inches(0.08)
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing = 1.05
    p_pr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), PALE_GRAY)
    p_pr.append(shd)
    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:before"), "100")
    spacing.set(qn("w:after"), "100")
    p_pr.append(spacing)
    run = p.add_run(code.strip("\n"))
    set_font(run, "Consolas", 8.4, color=RGBColor(20, 25, 30))


def add_table(doc: Document, headers: list[str], rows: list[list[str]], widths: list[float] | None = None) -> None:
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    for idx, header in enumerate(headers):
        cell = table.rows[0].cells[idx]
        set_cell_shading(cell, NAVY)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = p.add_run(header)
        set_font(run, "Aptos", 9, bold=True, color=RGBColor(255, 255, 255))
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for idx, value in enumerate(values):
            if row_index % 2 == 1:
                set_cell_shading(cells[idx], PALE_BLUE)
            p = cells[idx].paragraphs[0]
            run = p.add_run(value)
            set_font(run, "Aptos", 9)
    if widths:
        for row in table.rows:
            for idx, width in enumerate(widths):
                row.cells[idx].width = Inches(width)
    set_repeat_table_rows(table)
    table.rows[0]._tr.get_or_add_trPr()
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(1)


def page_break(doc: Document) -> None:
    spacer = doc.add_paragraph()
    spacer.paragraph_format.page_break_before = True
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.line_spacing = 1
    run = spacer.add_run("\u00a0")
    set_font(run, "Aptos", 24, color=RGBColor(255, 255, 255))


def configure_styles(doc: Document) -> None:
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Aptos"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
    normal.font.size = Pt(10.7)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.13
    normal.font.color.rgb = RGBColor(20, 24, 28)

    title = styles["Title"]
    title.font.name = "Aptos Display"
    title._element.rPr.rFonts.set(qn("w:ascii"), "Aptos Display")
    title._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos Display")
    title.font.size = Pt(31)
    title.font.bold = True
    title.font.color.rgb = RGBColor(0, 0, 0)
    title.paragraph_format.space_after = Pt(16)
    title_ppr = title._element.get_or_add_pPr()
    title_border = title_ppr.find(qn("w:pBdr"))
    if title_border is not None:
        title_ppr.remove(title_border)

    for style_name, size, before, after in (
        ("Heading 1", 19, 18, 8),
        ("Heading 2", 14, 14, 6),
        ("Heading 3", 11.5, 10, 4),
    ):
        style = styles[style_name]
        style.font.name = "Aptos Display"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Aptos Display")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos Display")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for list_style in ("List Bullet", "List Number"):
        style = styles[list_style]
        style.font.name = "Aptos"
        style.font.size = Pt(10.5)
        style.paragraph_format.space_after = Pt(3)


def configure_sections(doc: Document) -> None:
    for index, section in enumerate(doc.sections):
        if index > 0:
            section.start = WD_SECTION.NEW_PAGE
        section.page_width = Inches(8.5)
        section.page_height = Inches(11)
        section.top_margin = Inches(0.25)
        section.bottom_margin = Inches(0.55)
        section.left_margin = Inches(0.78)
        section.right_margin = Inches(0.78)
        section.header_distance = Inches(0.3)
        section.footer_distance = Inches(0.3)


def configure_headers_and_footers(doc: Document) -> None:
    for section in doc.sections:
        section.header.is_linked_to_previous = False
        header = section.header
        header.paragraphs[0].clear()

        section.footer.is_linked_to_previous = False
        footer = section.footer
        footer.paragraphs[0].clear()


def build_document() -> Document:
    doc = Document()
    configure_styles(doc)
    configure_sections(doc)

    cover_spacer = doc.add_paragraph()
    cover_spacer.paragraph_format.space_after = Pt(0)
    cover_spacer.paragraph_format.line_spacing = 1
    cover_run = cover_spacer.add_run("\u00a0")
    set_font(cover_run, "Aptos", 24, color=RGBColor(255, 255, 255))

    p = doc.add_paragraph(style="Title")
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.add_run("Déploiement de Last Loop sur un VPS Ubuntu avec Nginx")
    title_ppr = p._p.get_or_add_pPr()
    title_border = title_ppr.find(qn("w:pBdr"))
    if title_border is not None:
        title_ppr.remove(title_border)

    subtitle = doc.add_paragraph()
    subtitle.paragraph_format.space_after = Pt(28)
    run = subtitle.add_run("Guide de production et exploitation")
    set_font(run, "Aptos Display", 16, bold=False, color=TEXT_GRAY)

    meta = doc.add_paragraph()
    meta.paragraph_format.space_after = Pt(26)
    r = meta.add_run("Version 1.0\n11 novembre 2026\nCible Ubuntu récent avec Nginx et SQLite")
    set_font(r, "Aptos", 10.5, color=TEXT_GRAY)

    add_heading(doc, "Objet du guide", 1)
    add_body(doc, "Ce document décrit une installation complète de Last Loop sur un VPS Ubuntu récent. Le serveur Node.js écoute uniquement sur 127.0.0.1. Nginx reçoit le trafic public, gère HTTPS avec Certbot et transmet les requêtes à l’application. La base SQLite, les secrets et les sauvegardes sont conservés hors du dossier des versions.")
    add_body(doc, "Le résultat attendu est un service qui redémarre automatiquement, une URL publique HTTPS, une base persistante, des e-mails d’invitation fonctionnels et une procédure documentée de sauvegarde, mise à jour et retour arrière.")

    add_heading(doc, "Architecture cible", 2)
    add_code(doc, "Internet\n  |\n  v\nNginx  ports 80 et 443  certificat TLS\n  |  proxy HTTP avec X Forwarded Proto\n  v\nLast Loop  127.0.0.1:3000  service systemd\n  |\n  +-- SQLite  /var/lib/last-loop/backyard.sqlite\n  +-- SMTP externe\n  +-- Fournisseur de tuiles OpenStreetMap", "Flux de production")

    page_break(doc)
    add_heading(doc, "Sommaire opérationnel", 1)
    add_numbers(doc, [
        "Préparer le domaine, le VPS et l’accès SSH",
        "Mettre Ubuntu à jour et installer les outils système",
        "Installer Node.js 22 et Nginx",
        "Créer l’utilisateur système et les répertoires persistants",
        "Livrer le code et construire la version de production",
        "Configurer les variables d’environnement",
        "Créer le service systemd",
        "Configurer Nginx et obtenir le certificat HTTPS",
        "Activer le pare-feu",
        "Initialiser Last Loop et tester les fonctions métier",
        "Automatiser les sauvegardes et préparer la restauration",
        "Mettre à jour, superviser et dépanner le service",
    ])

    add_heading(doc, "Valeurs à personnaliser", 1)
    add_body(doc, "Les commandes utilisent les variables ci-dessous. Remplace chaque exemple avant le déploiement. Le guide suppose que la branche de production est main.")
    add_table(doc, ["Variable", "Exemple", "Usage"], [
        ["LL_DOMAIN", "backyard.example.fr", "Nom DNS public de l’application"],
        ["LL_ADMIN_EMAIL", "admin@example.fr", "Adresse utilisée par Certbot"],
        ["LL_GIT_REPO", "git@github.com:organisation/last-loop.git", "Dépôt contenant le projet"],
        ["LL_BRANCH", "main", "Branche déployée"],
        ["LL_VPS", "deploy@203.0.113.10", "Connexion SSH utilisée pour rsync"],
    ], [1.35, 2.55, 2.95])
    page_break(doc)
    add_code(doc, 'export LL_DOMAIN="backyard.example.fr"\nexport LL_ADMIN_EMAIL="admin@example.fr"\nexport LL_GIT_REPO="git@github.com:organisation/last-loop.git"\nexport LL_BRANCH="main"', "Variables de la session SSH")

    add_heading(doc, "Préconditions", 1)
    add_bullets(doc, [
        "Un VPS Ubuntu 24.04 LTS ou version plus récente avec au moins 1 Go de RAM et 2 Go recommandés.",
        "Un utilisateur SSH disposant de sudo. La connexion directe de root n’est pas nécessaire.",
        "Un enregistrement DNS A pointant vers l’adresse IPv4 du VPS. Ajouter AAAA uniquement si IPv6 fonctionne réellement.",
        "Les ports TCP 80 et 443 accessibles depuis Internet. Le port 3000 ne doit jamais être ouvert publiquement.",
        "Un serveur SMTP capable d’envoyer les invitations et les liens de réinitialisation.",
        "Un fournisseur de tuiles OpenStreetMap adapté au volume attendu ou l’acceptation explicite de la politique du serveur communautaire.",
    ])

    add_heading(doc, "Préparation du VPS", 1)
    add_heading(doc, "Connexion et contrôle du système", 2)
    add_code(doc, 'ssh deploy@ADRESSE_IP_DU_VPS\nlsb_release -a\nuname -m\nfree -h\ndf -h /', "Depuis le poste administrateur")
    add_body(doc, "Une architecture amd64 ou arm64 convient. Vérifie que la partition système conserve plusieurs gigaoctets libres pour Node.js, les releases, les journaux et les sauvegardes.")

    add_heading(doc, "Mise à jour Ubuntu", 2)
    add_code(doc, "sudo apt update\nsudo apt full-upgrade -y\nsudo apt install -y curl ca-certificates gnupg git rsync sqlite3 nginx ufw unattended-upgrades\nsudo systemctl enable --now nginx\nsudo systemctl status nginx --no-pager", "Commandes à exécuter sur le VPS")
    add_body(doc, "Si le noyau ou des bibliothèques critiques ont été mis à jour, redémarre puis reconnecte-toi avant de continuer.")
    add_code(doc, "sudo reboot", "Redémarrage si nécessaire")

    page_break(doc)
    add_heading(doc, "Mises à jour de sécurité automatiques", 2)
    add_code(doc, "sudo dpkg-reconfigure --priority=low unattended-upgrades\nsystemctl status unattended-upgrades --no-pager", "Activation et vérification")

    add_heading(doc, "Installation de Node.js 22", 1)
    add_body(doc, "Last Loop exige Node.js 22.13.0 ou supérieur. Le dépôt NodeSource 22.x fournit les paquets nécessaires pour Ubuntu récent.")
    add_code(doc, "curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh\nless /tmp/nodesource_setup.sh\nsudo -E bash /tmp/nodesource_setup.sh\nsudo apt install -y nodejs\nnode --version\nnpm --version\ncommand -v node", "Installation et contrôle")
    add_body(doc, "Le chemin affiché par command -v node sera généralement /usr/bin/node. Utilise ce chemin dans le service systemd si le résultat diffère.")

    add_heading(doc, "Compte système et stockage persistant", 1)
    add_body(doc, "Le processus applicatif utilise un compte sans mot de passe ni shell interactif. Les releases sont séparées de la base et des sauvegardes.")
    add_code(doc, "sudo useradd --system --user-group --home-dir /opt/last-loop --shell /usr/sbin/nologin lastloop\nsudo install -d -o lastloop -g lastloop -m 0750 /opt/last-loop\nsudo install -d -o lastloop -g lastloop -m 0750 /opt/last-loop/releases\nsudo install -d -o lastloop -g lastloop -m 0750 /var/lib/last-loop\nsudo install -d -o root -g root -m 0700 /var/backups/last-loop\nid lastloop\nls -ld /opt/last-loop /opt/last-loop/releases /var/lib/last-loop /var/backups/last-loop", "Création des identités et répertoires")
    add_body(doc, "Si useradd indique que le compte existe déjà, vérifie-le avec id lastloop et ne recrée pas le compte.")

    page_break(doc)
    add_heading(doc, "Livraison du code avec Git", 1)
    add_body(doc, "Cette méthode convient lorsque le VPS peut lire le dépôt. Pour un dépôt privé, ajoute une clé de déploiement en lecture seule au compte lastloop ou utilise la méthode rsync décrite ensuite.")
    add_code(doc, 'export LL_RELEASE_ID="$(date +%Y%m%d%H%M%S)"\nexport LL_RELEASE_DIR="/opt/last-loop/releases/${LL_RELEASE_ID}"\nsudo -u lastloop git clone --depth 1 --branch "$LL_BRANCH" "$LL_GIT_REPO" "$LL_RELEASE_DIR"\nsudo -u lastloop npm --prefix "$LL_RELEASE_DIR" ci\nsudo -u lastloop env \\\n  NEXT_PUBLIC_MAP_TILE_URL=\'https://tile.openstreetmap.org/{z}/{x}/{y}.png\' \\\n  NEXT_PUBLIC_MAP_ATTRIBUTION=\'&copy; OpenStreetMap contributors\' \\\n  npm --prefix "$LL_RELEASE_DIR" run build\nsudo ln -sfn "$LL_RELEASE_DIR" /opt/last-loop/current\nreadlink -f /opt/last-loop/current\ntest -f /opt/last-loop/current/dist/standalone/server.js', "Clone et build initial")

    page_break(doc)
    add_heading(doc, "Livraison du code avec rsync", 1)
    add_body(doc, "Utilise cette variante lorsque le dépôt reste uniquement sur le poste de développement. La première commande s’exécute sur le poste local depuis la racine du projet.")
    add_code(doc, 'export LL_VPS="deploy@203.0.113.10"\nexport LL_RELEASE_ID="$(date +%Y%m%d%H%M%S)"\nrsync -az --exclude=.git --exclude=node_modules --exclude=dist --exclude=data --exclude=apps/tracker/node_modules ./ "$LL_VPS:/tmp/last-loop-$LL_RELEASE_ID/"', "Sur le poste de développement")
    add_code(doc, 'export LL_RELEASE_ID="20261111153000"\nexport LL_RELEASE_DIR="/opt/last-loop/releases/${LL_RELEASE_ID}"\nsudo install -d -o lastloop -g lastloop -m 0750 "$LL_RELEASE_DIR"\nsudo rsync -a "/tmp/last-loop-$LL_RELEASE_ID/" "$LL_RELEASE_DIR/"\nsudo chown -R lastloop:lastloop "$LL_RELEASE_DIR"\nsudo -u lastloop npm --prefix "$LL_RELEASE_DIR" ci\nsudo -u lastloop env \\\n  NEXT_PUBLIC_MAP_TILE_URL=\'https://tile.openstreetmap.org/{z}/{x}/{y}.png\' \\\n  NEXT_PUBLIC_MAP_ATTRIBUTION=\'&copy; OpenStreetMap contributors\' \\\n  npm --prefix "$LL_RELEASE_DIR" run build\nsudo ln -sfn "$LL_RELEASE_DIR" /opt/last-loop/current', "Sur le VPS après le transfert")
    add_body(doc, "Le numéro LL_RELEASE_ID utilisé sur le VPS doit être exactement celui créé sur le poste local.")

    page_break(doc)
    add_heading(doc, "Configuration de production", 1)
    add_body(doc, "Le fichier /etc/last-loop.env contient les secrets et les réglages de fonctionnement. Il n’est ni placé dans Git ni copié dans une release.")
    add_code(doc, "sudo install -o root -g root -m 0600 /dev/null /etc/last-loop.env\nsudo nano /etc/last-loop.env", "Création du fichier")
    add_code(doc, "NODE_ENV=production\nHOST=127.0.0.1\nPORT=3000\nDATABASE_PATH=/var/lib/last-loop/backyard.sqlite\nSEED_DEMO_DATA=false\nAPP_URL=https://backyard.example.fr\n\nSMTP_HOST=smtp.example.fr\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=backyard@example.fr\nSMTP_PASSWORD=REMPLACER_PAR_UN_SECRET_LONG\nMAIL_FROM=Last Loop <no-reply@example.fr>\nMAIL_PREVIEW=false\n\nNEXT_PUBLIC_MAP_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png\nNEXT_PUBLIC_MAP_ATTRIBUTION=&copy; OpenStreetMap contributors\n\nGPS_RETENTION_DAYS=14\nGPS_OFF_ROUTE_THRESHOLD_M=200", "Contenu de /etc/last-loop.env")
    add_body(doc, "Remplace backyard.example.fr par le domaine réel. APP_URL ne doit pas se terminer par un slash. SMTP_SECURE vaut true avec TLS direct, généralement sur le port 465, et false avec STARTTLS, généralement sur le port 587.")
    add_code(doc, "sudo chown root:root /etc/last-loop.env\nsudo chmod 600 /etc/last-loop.env\nsudo stat -c '%U %G %a %n' /etc/last-loop.env", "Protection des secrets")

    page_break(doc)
    add_heading(doc, "Variables essentielles", 2)
    add_table(doc, ["Variable", "Valeur recommandée", "Contrôle"], [
        ["NODE_ENV", "production", "Désactive les données de démonstration par défaut"],
        ["HOST", "127.0.0.1", "Empêche un accès direct au processus Node"],
        ["DATABASE_PATH", "/var/lib/last-loop/backyard.sqlite", "Chemin persistant hors des releases"],
        ["SEED_DEMO_DATA", "false", "Ne charge aucun événement fictif"],
        ["APP_URL", "https://domaine", "Produit des liens e-mail publics valides"],
        ["MAIL_PREVIEW", "false", "Obligatoire en production"],
        ["GPS_RETENTION_DAYS", "14", "Plage acceptée de 1 à 90 jours"],
        ["GPS_OFF_ROUTE_THRESHOLD_M", "200", "Plage acceptée de 50 à 2000 mètres"],
    ], [1.55, 2.25, 3.05])

    page_break(doc)
    add_heading(doc, "Service systemd", 1)
    add_body(doc, "systemd démarre Last Loop au boot, redémarre le processus après une erreur et limite ses droits d’écriture au répertoire de la base.")
    add_code(doc, "sudo nano /etc/systemd/system/last-loop.service", "Création du service")
    add_code(doc, "[Unit]\nDescription=Last Loop Backyard tracking\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=simple\nUser=lastloop\nGroup=lastloop\nWorkingDirectory=/opt/last-loop/current\nEnvironmentFile=/etc/last-loop.env\nExecStart=/usr/bin/node /opt/last-loop/current/dist/standalone/server.js\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=30\nKillSignal=SIGTERM\nUMask=0077\nNoNewPrivileges=true\nPrivateTmp=true\nProtectSystem=strict\nProtectHome=true\nProtectKernelTunables=true\nProtectKernelModules=true\nProtectControlGroups=true\nRestrictSUIDSGID=true\nReadWritePaths=/var/lib/last-loop\nLimitNOFILE=65535\n\n[Install]\nWantedBy=multi-user.target", "Contenu de /etc/systemd/system/last-loop.service")
    add_body(doc, "Si command -v node n’a pas retourné /usr/bin/node, remplace ExecStart par le chemin réel.")
    add_code(doc, "sudo systemctl daemon-reload\nsudo systemctl enable --now last-loop\nsudo systemctl status last-loop --no-pager\nsudo journalctl -u last-loop -n 100 --no-pager\ncurl -fsS http://127.0.0.1:3000/api/health", "Activation et test local")
    add_body(doc, "La dernière commande doit retourner un objet JSON contenant status ok et database ok. Un code HTTP 503 indique que la base n’a pas pu être ouverte.")

    page_break(doc)
    add_heading(doc, "Configuration Nginx", 1)
    add_body(doc, "Commence avec un virtual host HTTP. Certbot utilisera ce bloc pour vérifier le domaine puis ajoutera la configuration TLS et la redirection HTTPS.")
    add_code(doc, "sudo nano /etc/nginx/sites-available/last-loop", "Création du virtual host")
    add_code(doc, "server {\n    listen 80;\n    listen [::]:80;\n    server_name backyard.example.fr;\n\n    server_tokens off;\n    client_max_body_size 3m;\n\n    add_header X-Content-Type-Options nosniff always;\n    add_header Referrer-Policy strict-origin-when-cross-origin always;\n    add_header Permissions-Policy \"geolocation=(self)\" always;\n\n    location / {\n        proxy_pass http://127.0.0.1:3000;\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_set_header X-Forwarded-Host $host;\n        proxy_set_header X-Forwarded-Port $server_port;\n        proxy_connect_timeout 5s;\n        proxy_send_timeout 90s;\n        proxy_read_timeout 90s;\n    }\n}", "Contenu de /etc/nginx/sites-available/last-loop")
    add_code(doc, "sudo ln -s /etc/nginx/sites-available/last-loop /etc/nginx/sites-enabled/last-loop\nsudo nginx -t\nsudo systemctl reload nginx\ncurl -I http://backyard.example.fr/api/health", "Activation du site HTTP")
    add_body(doc, "Ne supprime le site Nginx par défaut que si aucun autre site ne l’utilise. Cette suppression est facultative.")
    add_code(doc, "sudo unlink /etc/nginx/sites-enabled/default\nsudo nginx -t\nsudo systemctl reload nginx", "Suppression facultative du site par défaut")

    page_break(doc)
    add_heading(doc, "Certificat HTTPS avec Certbot", 1)
    add_body(doc, "Le DNS doit déjà pointer vers le VPS et le port 80 doit être joignable depuis Internet. Certbot recommande son paquet snap pour disposer d’une version maintenue.")
    add_heading(doc, "Installation et émission du certificat", 2)
    add_code(doc, "sudo snap install --classic certbot\nsudo ln -s /snap/bin/certbot /usr/local/bin/certbot 2>/dev/null || true\nsudo certbot --nginx -d backyard.example.fr -m admin@example.fr --agree-tos --no-eff-email --redirect")
    add_code(doc, "sudo nginx -t\nsudo systemctl reload nginx\ncurl -fsS https://backyard.example.fr/api/health\nsudo certbot renew --dry-run\nsystemctl list-timers --all | grep certbot", "Contrôles TLS et renouvellement")
    add_body(doc, "Après validation complète de HTTPS, ajoute HSTS dans le bloc server qui écoute sur 443, puis teste Nginx. N’active pas HSTS avant d’être certain que le domaine restera disponible en HTTPS.")
    add_code(doc, 'add_header Strict-Transport-Security "max-age=31536000" always;', "Directive HSTS à ajouter dans le bloc HTTPS")

    add_heading(doc, "Pare feu UFW", 1)
    add_body(doc, "Autorise SSH avant d’activer UFW pour éviter de perdre l’accès. Si SSH utilise un port différent, autorise ce port à la place du profil OpenSSH.")
    add_code(doc, "sudo ufw default deny incoming\nsudo ufw default allow outgoing\nsudo ufw allow OpenSSH\nsudo ufw allow 'Nginx Full'\nsudo ufw enable\nsudo ufw status verbose", "Règles recommandées")
    add_body(doc, "N’ajoute aucune règle pour le port 3000. Le processus Node écoute sur 127.0.0.1 et reste accessible uniquement depuis le VPS.")

    page_break(doc)
    add_heading(doc, "Premier démarrage applicatif", 1)
    add_numbers(doc, [
        "Ouvre https://backyard.example.fr/api/health et vérifie status ok.",
        "Ouvre https://backyard.example.fr/setup et crée immédiatement le premier compte directeur.",
        "Connecte-toi à l’espace directeur et crée les comptes administrateurs nécessaires.",
        "Envoie une invitation à une adresse de test pour vérifier SMTP, APP_URL et la réinitialisation du mot de passe.",
        "Crée un événement avec un fichier GPX puis vérifie la distance, le dénivelé et la carte OpenStreetMap.",
        "Ouvre la page publique, le dashboard directeur et l’écran vidéo projecteur.",
        "Depuis un téléphone en 4G ou 5G, ouvre /track, associe un code GPS et contrôle la réception d’une position.",
    ])
    add_body(doc, "La route /setup accepte uniquement la création du premier utilisateur. Une fois le directeur créé, elle refuse les nouvelles initialisations.")

    add_heading(doc, "Contrôle SMTP", 1)
    add_body(doc, "En production, l’absence de configuration SMTP provoque une erreur lors de l’envoi d’une invitation ou d’un lien de réinitialisation. MAIL_PREVIEW doit rester à false.")
    add_bullets(doc, [
        "Port 587 avec SMTP_SECURE=false pour STARTTLS dans la majorité des configurations.",
        "Port 465 avec SMTP_SECURE=true pour TLS direct.",
        "APP_URL doit correspondre exactement au domaine HTTPS public.",
        "MAIL_FROM doit être autorisé par le fournisseur SMTP. Configure SPF, DKIM et DMARC sur le domaine d’envoi.",
    ])
    add_code(doc, "sudo systemctl restart last-loop\nsudo journalctl -u last-loop -n 100 --no-pager", "Après toute modification de /etc/last-loop.env")

    add_heading(doc, "Cartographie", 1)
    add_body(doc, "Le serveur communautaire tile.openstreetmap.org est un service sans garantie de disponibilité. Il peut convenir à un test ou à une audience réduite si sa politique est respectée. Pour une course très consultée, configure un fournisseur de tuiles avec des limites et un support adaptés.")
    add_body(doc, "Les variables NEXT_PUBLIC_MAP_TILE_URL et NEXT_PUBLIC_MAP_ATTRIBUTION sont intégrées au code client pendant npm run build. Toute modification impose donc une nouvelle compilation et un redémarrage de l’application.")

    page_break(doc)
    add_heading(doc, "Sauvegarde automatique de SQLite", 1)
    add_body(doc, "SQLite utilise le mode WAL. La commande interne .backup crée une sauvegarde cohérente pendant que l’application fonctionne. Le script ci-dessous compresse le fichier et conserve trente jours de sauvegardes locales.")
    add_code(doc, "sudo nano /usr/local/sbin/last-loop-backup", "Création du script")
    add_code(doc, "#!/usr/bin/env bash\nset -euo pipefail\n\nLL_DB=\"/var/lib/last-loop/backyard.sqlite\"\nLL_BACKUP_DIR=\"/var/backups/last-loop\"\nLL_TIMESTAMP=\"$(date -u +%Y%m%dT%H%M%SZ)\"\nLL_TARGET=\"${LL_BACKUP_DIR}/backyard-${LL_TIMESTAMP}.sqlite\"\n\ninstall -d -o root -g root -m 0700 \"$LL_BACKUP_DIR\"\nsqlite3 \"$LL_DB\" \".timeout 5000\" \".backup '$LL_TARGET'\"\ngzip -f \"$LL_TARGET\"\nfind \"$LL_BACKUP_DIR\" -type f -name 'backyard-*.sqlite.gz' -mtime +30 -delete", "Contenu de /usr/local/sbin/last-loop-backup")
    add_code(doc, "sudo chown root:root /usr/local/sbin/last-loop-backup\nsudo chmod 750 /usr/local/sbin/last-loop-backup\nsudo /usr/local/sbin/last-loop-backup\nsudo ls -lh /var/backups/last-loop", "Droits et premier test")

    page_break(doc)
    add_heading(doc, "Planification systemd", 2)
    add_code(doc, "sudo nano /etc/systemd/system/last-loop-backup.service", "Service de sauvegarde")
    add_code(doc, "[Unit]\nDescription=Sauvegarde SQLite Last Loop\n\n[Service]\nType=oneshot\nExecStart=/usr/local/sbin/last-loop-backup\nNice=10\nIOSchedulingClass=best-effort\nIOSchedulingPriority=7", "Contenu du service")
    add_code(doc, "sudo nano /etc/systemd/system/last-loop-backup.timer", "Minuterie quotidienne")
    add_code(doc, "[Unit]\nDescription=Sauvegarde quotidienne Last Loop\n\n[Timer]\nOnCalendar=*-*-* 03:15:00\nPersistent=true\nRandomizedDelaySec=15m\n\n[Install]\nWantedBy=timers.target", "Contenu de la minuterie")
    page_break(doc)
    add_code(doc, "sudo systemctl daemon-reload\nsudo systemctl enable --now last-loop-backup.timer\nsudo systemctl start last-loop-backup.service\nsudo systemctl status last-loop-backup.service --no-pager\nsystemctl list-timers --all | grep last-loop", "Activation et vérification")
    add_body(doc, "Une sauvegarde conservée uniquement sur le VPS ne protège pas contre la perte du serveur. Copie régulièrement les archives vers un stockage externe chiffré et teste une restauration complète.")

    add_heading(doc, "Restauration de la base", 1)
    add_body(doc, "Choisis une sauvegarde précise, annonce l’interruption puis arrête l’application avant de remplacer la base. Conserve toujours le fichier actuel pour pouvoir revenir en arrière.")
    add_code(doc, "sudo systemctl stop last-loop\nexport LL_RESTORE_ID=\"$(date -u +%Y%m%dT%H%M%SZ)\"\nsudo install -d -o root -g root -m 0700 \"/var/backups/last-loop/pre-restore-$LL_RESTORE_ID\"\nsudo cp -a /var/lib/last-loop/backyard.sqlite* \"/var/backups/last-loop/pre-restore-$LL_RESTORE_ID/\"\nsudo mv /var/lib/last-loop/backyard.sqlite-wal \"/var/backups/last-loop/pre-restore-$LL_RESTORE_ID/backyard.sqlite-wal.original\" 2>/dev/null || true\nsudo mv /var/lib/last-loop/backyard.sqlite-shm \"/var/backups/last-loop/pre-restore-$LL_RESTORE_ID/backyard.sqlite-shm.original\" 2>/dev/null || true\nsudo gzip -dc /var/backups/last-loop/backyard-20261111T031500Z.sqlite.gz | sudo tee /var/lib/last-loop/backyard.sqlite >/dev/null\nsudo chown lastloop:lastloop /var/lib/last-loop/backyard.sqlite\nsudo chmod 600 /var/lib/last-loop/backyard.sqlite\nsudo systemctl start last-loop\ncurl -fsS http://127.0.0.1:3000/api/health\nsudo journalctl -u last-loop -n 100 --no-pager", "Procédure de restauration")
    add_body(doc, "Remplace le nom de l’archive par la sauvegarde choisie. La base précédente est copiée dans le dossier pre-restore. Les éventuels fichiers WAL et SHM sont également préservés puis retirés du répertoire actif avant l’écriture de la sauvegarde restaurée.")

    page_break(doc)
    add_heading(doc, "Mise à jour de Last Loop", 1)
    add_body(doc, "Chaque mise à jour crée une nouvelle release. La base et le fichier d’environnement restent en place. La bascule du lien current permet un retour arrière rapide.")
    add_code(doc, 'sudo /usr/local/sbin/last-loop-backup\nexport LL_RELEASE_ID="$(date +%Y%m%d%H%M%S)"\nexport LL_RELEASE_DIR="/opt/last-loop/releases/${LL_RELEASE_ID}"\nsudo -u lastloop git clone --depth 1 --branch "$LL_BRANCH" "$LL_GIT_REPO" "$LL_RELEASE_DIR"\nsudo -u lastloop npm --prefix "$LL_RELEASE_DIR" ci\nsudo -u lastloop env \\\n  NEXT_PUBLIC_MAP_TILE_URL=\'https://tile.openstreetmap.org/{z}/{x}/{y}.png\' \\\n  NEXT_PUBLIC_MAP_ATTRIBUTION=\'&copy; OpenStreetMap contributors\' \\\n  npm --prefix "$LL_RELEASE_DIR" run test\nsudo ln -sfn "$LL_RELEASE_DIR" /opt/last-loop/current\nsudo systemctl restart last-loop\ncurl -fsS http://127.0.0.1:3000/api/health\ncurl -fsS "https://$LL_DOMAIN/api/health"\nsudo journalctl -u last-loop -n 100 --no-pager', "Déploiement d’une nouvelle release")
    add_body(doc, "npm run test exécute le lint puis le build. La coupure correspond au temps de redémarrage du service après la bascule du lien.")

    add_heading(doc, "Retour arrière", 2)
    add_code(doc, "ls -1dt /opt/last-loop/releases/*\nsudo ln -sfn /opt/last-loop/releases/RELEASE_PRECEDENTE /opt/last-loop/current\nsudo systemctl restart last-loop\ncurl -fsS http://127.0.0.1:3000/api/health\nsudo journalctl -u last-loop -n 100 --no-pager", "Retour au code précédent")
    add_body(doc, "Un retour au code précédent ne restaure pas automatiquement la base. Si la nouvelle version a modifié le schéma de manière incompatible, restaure aussi la sauvegarde réalisée avant la mise à jour.")

    page_break(doc)
    add_heading(doc, "Supervision et journaux", 1)
    add_table(doc, ["Contrôle", "Commande ou URL", "Résultat attendu"], [
        ["Application locale", "curl http://127.0.0.1:3000/api/health", "HTTP 200 et status ok"],
        ["Chaîne publique", "curl https://domaine/api/health", "HTTP 200 et certificat valide"],
        ["Service Node", "systemctl status last-loop", "active running"],
        ["Nginx", "nginx -t", "syntax is ok et test is successful"],
        ["Certificats", "certbot renew --dry-run", "simulation réussie"],
        ["Sauvegardes", "systemctl status last-loop-backup.service", "dernier lancement réussi"],
        ["Disque", "df -h / /var/lib/last-loop", "espace libre suffisant"],
    ], [1.35, 3.05, 2.45])
    add_code(doc, "sudo journalctl -u last-loop -f\nsudo journalctl -u nginx -n 100 --no-pager\nsudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log", "Journaux utiles")
    add_body(doc, "Configure une sonde externe toutes les 30 à 60 secondes sur https://domaine/api/health. Déclenche une alerte pour un statut différent de 200, un certificat proche de l’expiration, un disque presque plein ou l’absence de sauvegarde récente.")

    page_break(doc)
    add_heading(doc, "Sécurité et protection des données", 1)
    add_bullets(doc, [
        "Expose uniquement SSH, HTTP et HTTPS. Ne publie jamais le port 3000 ni le fichier SQLite.",
        "Réserve /etc/last-loop.env à root et ne copie jamais son contenu dans un ticket, un dépôt ou une sauvegarde non chiffrée.",
        "Utilise des mots de passe uniques et active l’authentification SSH par clé. Désactive la connexion SSH par mot de passe lorsque tous les administrateurs ont validé leur clé.",
        "Conserve MAIL_PREVIEW=false et SEED_DEMO_DATA=false en production.",
        "Définis une durée de conservation GPS cohérente avec l’information donnée aux coureurs.",
        "Informe les participants que les positions récentes peuvent apparaître publiquement pendant la course.",
        "Teste les sauvegardes hors du VPS et protège leur accès comme celui de la base de production.",
    ])

    page_break(doc)
    add_heading(doc, "Dépannage", 1)
    add_table(doc, ["Symptôme", "Diagnostic", "Action"], [
        ["502 Bad Gateway", "systemctl status last-loop puis journalctl", "Redémarrer le service et corriger l’erreur Node"],
        ["Connexion qui boucle", "Vérifier HTTPS et X-Forwarded-Proto", "Conserver le header Nginx et vider l’ancien cookie"],
        ["Erreur SQLite", "Contrôler droits et espace disque", "chown lastloop et vérifier /var/lib/last-loop"],
        ["Invitation non envoyée", "Lire les journaux SMTP", "Corriger SMTP, MAIL_FROM et APP_URL"],
        ["Carte absente", "Inspecter l’URL des tuiles et le navigateur", "Recompiler après modification NEXT_PUBLIC_MAP"],
        ["GPX refusé", "Vérifier taille et structure", "Fichier inférieur à 2 Mo avec trkpt ou rtept"],
        ["GPS web refusé", "Vérifier le cadenas HTTPS et la permission", "Corriger TLS puis autoriser la localisation"],
    ], [1.5, 2.55, 2.8])

    page_break(doc)
    add_heading(doc, "Checklist de mise en production", 1)
    add_bullets(doc, [
        "Le DNS A pointe vers le VPS et AAAA n’existe que si IPv6 est opérationnel.",
        "Node.js respecte la version minimale 22.13.0.",
        "Last Loop écoute sur 127.0.0.1:3000 et le port 3000 est fermé publiquement.",
        "Le service last-loop est enabled et active running.",
        "Nginx transmet Host, X-Forwarded-For et X-Forwarded-Proto.",
        "Le certificat HTTPS est valide et certbot renew --dry-run réussit.",
        "UFW autorise SSH et Nginx Full uniquement.",
        "La base réside dans /var/lib/last-loop et appartient à lastloop.",
        "SEED_DEMO_DATA=false et MAIL_PREVIEW=false.",
        "Le premier compte directeur a été créé sur /setup.",
        "Une invitation e-mail et une réinitialisation de mot de passe ont été testées.",
        "Un GPX réel s’affiche sur la carte publique.",
        "Un téléphone en réseau mobile envoie une position GPS.",
        "La sauvegarde quotidienne fonctionne et une copie externe existe.",
        "La procédure de restauration a été testée hors production.",
        "Une sonde externe surveille /api/health.",
    ])

    page_break(doc)
    add_heading(doc, "Références officielles", 1)
    refs = [
        ("Distribution Node.js 22 pour Debian et Ubuntu", "https://github.com/nodesource/distributions"),
        ("Installation de Nginx sur Ubuntu Server", "https://ubuntu.com/server/docs/how-to/web-services/install-nginx/"),
        ("Pare feu UFW sur Ubuntu Server", "https://ubuntu.com/server/docs/firewalls/"),
        ("Instructions Certbot pour Nginx", "https://certbot.eff.org/instructions?os=snap&ws=nginx"),
        ("Module reverse proxy Nginx", "https://nginx.org/en/docs/http/ngx_http_proxy_module.html"),
        ("Politique des tuiles OpenStreetMap", "https://operations.osmfoundation.org/policies/tiles/"),
    ]
    for label, url in refs:
        p = doc.add_paragraph(style="List Bullet")
        add_hyperlink(p, label, url)

    add_body(doc, "Les commandes de ce guide correspondent à l’application Last Loop présente dans ce dépôt et aux procédures officielles consultées le 11 novembre 2026.")
    return doc


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = build_document()
    configure_sections(doc)
    configure_headers_and_footers(doc)
    doc.core_properties.title = "Déploiement de Last Loop sur un VPS Ubuntu avec Nginx"
    doc.core_properties.subject = "Guide de mise en production et exploitation"
    doc.core_properties.author = "Last Loop"
    doc.core_properties.keywords = "Last Loop, Ubuntu, VPS, Nginx, Node.js, SQLite, systemd, Certbot"
    doc.save(OUTPUT)
    print(OUTPUT)


if __name__ == "__main__":
    main()
