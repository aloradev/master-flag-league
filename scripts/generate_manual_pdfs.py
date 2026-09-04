from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
ASSETS = ROOT / "Claude outputs"
BASE = "https://master-flag-league.vercel.app/"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="Cover", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=30, alignment=TA_CENTER, textColor=colors.HexColor("#10233f"), spaceAfter=14))
styles.add(ParagraphStyle(name="Subtitle", parent=styles["Normal"], fontSize=11, leading=16, alignment=TA_CENTER, textColor=colors.HexColor("#526173"), spaceAfter=20))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=15, leading=19, textColor=colors.HexColor("#0c7184"), spaceBefore=13, spaceAfter=6))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontSize=10.3, leading=15, spaceAfter=7))
styles.add(ParagraphStyle(name="Step", parent=styles["BodyText"], fontSize=10.3, leading=15, leftIndent=12, firstLineIndent=-12, spaceAfter=4))
styles.add(ParagraphStyle(name="Note", parent=styles["BodyText"], fontSize=9.2, leading=13, backColor=colors.HexColor("#edf7f8"), borderColor=colors.HexColor("#b6dfe3"), borderWidth=0.5, borderPadding=7, spaceBefore=7, spaceAfter=10))

manuals = {
    "super-administrador": {
        "title": "Manual del Super administrador", "image": "admin-05-aviso-revision.png",
        "intro": "Este manual te guía desde la preparación de una temporada hasta el cierre de jornadas, usuarios, árbitros y finanzas.",
        "sections": [("1. Preparar la temporada", ["Abre la dirección oficial e inicia sesión. Si aparece una contraseña temporal, cámbiala.", "En Temporada configura fechas, horario base, aprobación y documentos.", "Agrega categorías y campos antes de registrar equipos."]), ("2. Crear accesos", ["En Usuarios selecciona Nuevo usuario.", "Captura nombre, correo, teléfono y rol.", "Entrega la contraseña temporal una sola vez.", "Para un árbitro, termina el proceso en Arbitros vinculándolo a la temporada."]), ("3. Publicar competencia", ["En Equipos verifica categoría y managers.", "En Validacion aprueba expedientes.", "En Jornadas genera, revisa descansos, guarda borrador y asigna campos y árbitros.", "Publica solo cuando fecha, horario, campo y arbitraje estén correctos."]), ("4. Problemas comunes", ["Usuario sin acceso: genera enlace desde Usuarios.", "Arbitro sin partido: revisa vinculación y asignación.", "Saldo incorrecto: revisa cargos y pagos; no edites saldos directamente."])]},
    "administrador-deportivo": {"title": "Manual del Administrador deportivo", "image": "light-02-propuesta.png", "intro": "Tu trabajo es mantener jugadores elegibles y publicar una jornada que los equipos puedan seguir.", "sections": [("1. Validar jugadores", ["Abre Validacion y elige un registro listo.", "Revisa fotografía e identificaciones.", "Pulsa Aprobar, Solicitar correccion o Rechazar.", "Si solicitas corrección, explica exactamente qué documento debe reemplazarse."]), ("2. Preparar la jornada", ["Pulsa Jornadas y Generar proxima jornada.", "Comprueba fecha, capacidad y descansos.", "Guarda como borrador.", "Abre Programacion y arbitros para cada partido.", "Guarda campo, hora, principal y auxiliar.", "Publica al finalizar la revisión."]), ("3. Rutina semanal", ["Antes: valida pendientes y confirma árbitros.", "Durante: atiende incidencias sin registrar jugadas por el árbitro.", "Después: revisa partidos finalizados, MVP y Posiciones."])]},
    "administrador-financiero": {"title": "Manual del Administrador financiero", "image": "light-05-finanzas-gastos.png", "intro": "Este manual explica cómo cobrar, registrar pagos y controlar gastos sin alterar saldos manualmente.", "sections": [("1. Registrar un cargo", ["Abre Finanzas y selecciona temporada y equipo.", "Captura concepto, importe y vencimiento.", "Guarda y confirma que el cargo aparezca en el estado de cuenta."]), ("2. Registrar un pago", ["Abre el estado del equipo.", "Registra fecha, importe, método y referencia.", "Comprueba que el saldo se recalculó."]), ("3. Registrar gastos", ["Captura concepto, monto, fecha y categoría.", "Relaciona arbitraje con árbitro o jornada cuando el formulario lo permita.", "Al cierre de cada jornada compara totales con comprobantes."]), ("4. Correcciones", ["Busca primero la temporada y equipo correctos.", "Revisa el movimiento individual.", "Si ya existe, solicita una corrección auditada; no borres sin explicación."])]},
    "manager-equipo": {"title": "Manual del Manager de equipo", "image": "dark-06-encargado-pagos.png", "intro": "Tu objetivo es mantener una plantilla completa, elegible y lista para cada jornada.", "sections": [("1. Seleccionar equipo", ["Abre Mi equipo desde la dirección oficial.", "Si administras varios equipos, selecciona el correcto antes de agregar jugadores o consultar pagos."]), ("2. Registrar jugador", ["Pulsa Agregar.", "Captura nombre, fecha de nacimiento, posición y número.", "Guarda el registro.", "Abre la ficha y sube fotografía e identificaciones.", "Confirma el resultado en Roster."]), ("3. Durante la temporada", ["Antes de cada jornada revisa elegibilidad, hora y campo.", "Después consulta Posiciones y Rankings.", "Si aparece Correcciones requeridas, lee el motivo y reemplaza el documento."]), ("4. Problemas comunes", ["Equipo equivocado: vuelve a Mi equipo y selecciona el correcto.", "Partido no visible: puede seguir como borrador o no estar publicado.", "Pago sin reflejar: confirma temporada y contacta a Finanzas."])]},
    "arbitro": {"title": "Manual del Arbitro", "image": "light-11-arbitro-bitacora.png", "intro": "Este flujo está pensado para registrar tocho bandera rápido, desde el celular y con el mínimo de toques.", "sections": [("1. Antes del partido", ["Abre Mis partidos.", "Entra solo al partido que te asignaron.", "Revisa campo, hora, equipos y elegibilidad."]), ("2. Registrar acciones", ["Pulsa Iniciar partido.", "Selecciona equipo y jugador cuando el botón lo pida.", "Registra touchdown, extra, pase completo, recepción, acarreo, intercepción, pase defendido y quite de flag.", "Confirma que el marcador cambió."]), ("3. Corregir y cerrar", ["Si una jugada fue incorrecta, abre bitácora y pulsa Anular.", "No registres una acción inversa.", "Al final elige MVP ofensivo y defensivo, agrega nota si hace falta y pulsa Finalizar partido."]), ("4. Incidencias", ["Si un jugador no es elegible, informa a administración.", "Si el otro árbitro registró una jugada, espera sincronización y no la dupliques.", "Si pierdes conexión, evita pulsar varias veces."])]},
    "publico": {"title": "Manual de Consulta pública", "image": "01-jornada-publica.png", "intro": "No necesitas cuenta. La liga puede compartir estos enlaces con jugadores, managers y familias.", "sections": [("1. Consultar jornada", ["Abre /jornada para ver la jornada publicada.", "Revisa rival, hora, campo, árbitros y marcador.", "Los borradores no aparecen al público."]), ("2. Consultar posiciones y rankings", ["Abre /tabla para posiciones por categoría.", "Abre /rankings y cambia categoría o estadística.", "Pulsa el nombre de un jugador para abrir su perfil."]), ("3. Compartir", ["Copia el enlace de la jornada y envíalo al grupo.", "Comparte /jugador/:id para mostrar un perfil público.", "No se muestran documentos, teléfono, correo ni fecha de nacimiento completa."])]},
}

def footer(canvas, doc):
    canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.setFillColor(colors.HexColor("#6a7785"))
    canvas.drawString(0.65 * inch, 0.42 * inch, "Master Flag League | " + BASE)
    canvas.drawRightString(7.85 * inch, 0.42 * inch, f"Pagina {doc.page}")
    canvas.restoreState()

def build(key, data):
    path = OUT / f"manual-{key}.pdf"; OUT.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(path), pagesize=letter, rightMargin=.65*inch, leftMargin=.65*inch, topMargin=.65*inch, bottomMargin=.65*inch, title=data["title"])
    story = [Spacer(1, .25*inch), Image(str(ROOT / "frontend" / "public" / "logo-256.webp"), width=1.25*inch, height=1.25*inch), Spacer(1, .12*inch), Paragraph(data["title"], styles["Cover"]), Paragraph(BASE, styles["Subtitle"]), Paragraph(data["intro"], styles["Bodyx"]), Spacer(1, .08*inch)]
    image = ASSETS / data["image"]
    if image.exists(): story += [Image(str(image), width=6.8*inch, height=3.05*inch, kind="proportional"), Spacer(1, .12*inch)]
    for heading, steps in data["sections"]:
        story.append(Paragraph(heading, styles["H2x"]))
        for i, step in enumerate(steps, 1): story.append(Paragraph(f"{i}. {step}", styles["Step"]))
    story.append(Spacer(1, .1*inch)); story.append(Paragraph("Si una opción no aparece, confirma que estás usando la cuenta y temporada correctas. Para soporte, informa usuario, pantalla y mensaje exacto; nunca compartas tu contraseña.", styles["Note"]))
    doc.build(story, onFirstPage=footer, onLaterPages=footer)

for key, data in manuals.items(): build(key, data)
print(f"Generados {len(manuals)} manuales en {OUT}")
