from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.colors import HexColor
from pathlib import Path

OUT = Path('output/pdf/manual-usuario-scrimmage-master-flag-league.pdf')
OUT.parent.mkdir(parents=True, exist_ok=True)

navy = HexColor('#102a43'); teal = HexColor('#0f766e'); orange = HexColor('#f59e0b'); light = HexColor('#eef6f6'); gray = HexColor('#52606d')
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='CoverTitle', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=25, leading=30, textColor=navy, alignment=TA_CENTER, spaceAfter=12))
styles.add(ParagraphStyle(name='CoverSub', parent=styles['Normal'], fontSize=12, leading=18, textColor=gray, alignment=TA_CENTER))
styles.add(ParagraphStyle(name='H1x', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=navy, spaceBefore=6, spaceAfter=10))
styles.add(ParagraphStyle(name='H2x', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=teal, spaceBefore=8, spaceAfter=5))
styles.add(ParagraphStyle(name='Bodyx', parent=styles['BodyText'], fontSize=9.5, leading=14, textColor=navy, spaceAfter=6))
styles.add(ParagraphStyle(name='Smallx', parent=styles['BodyText'], fontSize=8, leading=11, textColor=gray))
styles.add(ParagraphStyle(name='Step', parent=styles['BodyText'], fontSize=9.5, leading=14, textColor=navy, leftIndent=8, bulletIndent=0, spaceAfter=4))

def footer(canvas, doc):
    canvas.saveState(); canvas.setStrokeColor(HexColor('#d9e2ec')); canvas.line(0.65*inch, 0.55*inch, 7.85*inch, 0.55*inch)
    canvas.setFont('Helvetica', 8); canvas.setFillColor(gray); canvas.drawString(0.7*inch, 0.35*inch, 'Master Flag League · Guía de usuario')
    canvas.drawRightString(7.8*inch, 0.35*inch, f'Página {doc.page}')
    canvas.restoreState()

def box(title, text, color=light):
    t = Table([[Paragraph(f'<b>{title}</b><br/>{text}', styles['Bodyx'])]], colWidths=[7.1*inch])
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),color),('BOX',(0,0),(-1,-1),0.7,teal),('LEFTPADDING',(0,0),(-1,-1),10),('RIGHTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8)]))
    return t

def step(n, title, text):
    return Table([[Paragraph(f'<b>{n}</b>', ParagraphStyle('num'+str(n), parent=styles['Bodyx'], fontSize=14, textColor=colors.white, alignment=TA_CENTER)), Paragraph(f'<b>{title}</b><br/>{text}', styles['Bodyx'])]], colWidths=[0.38*inch,6.7*inch], style=TableStyle([('BACKGROUND',(0,0),(0,0),teal),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))

story=[]
story += [Spacer(1,0.55*inch), Paragraph('MANUAL DE USUARIO', styles['CoverSub']), Spacer(1,0.15*inch), Paragraph('Scrimmages y operación de partidos', styles['CoverTitle']), Paragraph('Master Flag League', styles['CoverSub']), Spacer(1,0.35*inch)]
story += [box('¿Para qué sirve esta guía?', 'Explica cómo preparar un partido de prueba cuando todavía no hay equipos, jugadores o árbitros registrados; cómo operarlo desde el modo árbitro; y cómo compartir el marcador y los touchdowns con el público.'), Spacer(1,0.3*inch)]
story += [Paragraph('<b>URL de la aplicación:</b> https://master-flag-league.vercel.app/', styles['Bodyx']), Paragraph('<b>Recomendación:</b> usar Chrome o Edge desde un teléfono durante el partido.', styles['Bodyx']), PageBreak()]

story += [Paragraph('1. Antes de comenzar', styles['H1x']), Paragraph('Para crear un scrimmage solo se necesita una cuenta con permisos de administración, una temporada activa y al menos una categoría. El sistema crea los dos equipos temporales al guardar el partido.', styles['Bodyx']),
          box('Importante', 'No es necesario registrar jugadores, crear un roster ni asignar un árbitro en la sección de árbitros. El partido de prueba queda separado de la competencia oficial y no modifica posiciones, rankings, playoffs ni estadísticas oficiales.'),
          Paragraph('Quién puede hacer cada acción', styles['H2x'])]
table=Table([[Paragraph('<b>Usuario</b>',styles['Bodyx']),Paragraph('<b>Puede hacer</b>',styles['Bodyx'])],[Paragraph('Administrador',styles['Bodyx']),Paragraph('Crear scrimmages, entrar al modo árbitro, iniciar/cerrar el partido y revisar resultados.',styles['Bodyx'])],[Paragraph('Árbitro con cuenta',styles['Bodyx']),Paragraph('Ver scrimmages disponibles y registrar jugadas desde Modo árbitro, aunque no esté asignado.',styles['Bodyx'])],[Paragraph('Público',styles['Bodyx']),Paragraph('Consultar la jornada, marcador actualizado y touchdowns, sin iniciar sesión.',styles['Bodyx'])]], colWidths=[1.5*inch,5.6*inch])
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),navy),('TEXTCOLOR',(0,0),(-1,0),colors.white),('GRID',(0,0),(-1,-1),0.4,HexColor('#d9e2ec')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
story += [table, PageBreak()]

story += [Paragraph('2. Crear un scrimmage de prueba', styles['H1x']), Paragraph('Inicia sesión como administrador y sigue este recorrido:', styles['Bodyx']),
          step(1,'Abrir la sección de scrimmages','En el menú lateral selecciona <b>Scrimmages</b> o <b>Scrimmage de prueba</b>.'),
          step(2,'Elegir la categoría','Selecciona la categoría de la temporada activa. Si no aparece ninguna, primero crea una categoría desde Administración > Categorías.'),
          step(3,'Escribir los equipos','Captura el nombre del equipo local y del visitante. No busques equipos en una lista: el sistema los creará automáticamente como equipos temporales.'),
          step(4,'Definir fecha y hora','Indica la fecha y la hora aproximada de inicio.'),
          step(5,'Guardar','Pulsa <b>Crear scrimmage</b>. Aparecerá el identificador del partido y el encuentro quedará publicado para operación.'), Spacer(1,0.12*inch),
          box('Ejemplo', 'Categoría: Femenil · Local: Halcones · Visitante: Jaguares · Fecha: día de la prueba · Hora: 19:00'), PageBreak()]

story += [Paragraph('3. Entrar y operar el partido', styles['H1x']), Paragraph('Después de crear el scrimmage, usa el menú <b>Modo árbitro</b>. Un administrador verá el partido aunque no exista un árbitro asignado. Si usas una cuenta con rol REFEREE, también aparecerá automáticamente.', styles['Bodyx']),
          step(1,'Abrir el partido','En la lista de partidos, toca el scrimmage recién creado.'),
          step(2,'Iniciar el partido','En la pantalla del partido pulsa <b>Iniciar partido</b>. El estado cambia a EN VIVO.'),
          step(3,'Registrar un touchdown','Selecciona el equipo que anotó y pulsa la jugada <b>Touchdown</b>. En un scrimmage no se exige seleccionar un jugador.'),
          step(4,'Registrar otras jugadas','Captura las acciones disponibles según lo que se quiera probar. El marcador se actualiza al confirmar cada acción.'),
          step(5,'Corregir una acción','Si registraste una jugada por error, utiliza la opción de deshacer/anular dentro del historial del partido. La corrección queda registrada.'),
          step(6,'Finalizar','Al terminar, pulsa <b>Finalizar partido</b> y confirma. El marcador queda disponible para consulta.'),
          box('Consejo para la prueba', 'Deja abierta la pantalla del árbitro en un teléfono y la página pública en otro dispositivo. Así podrás verificar que el marcador y los touchdowns se reflejan para el público.'), PageBreak()]

story += [Paragraph('4. Ver el partido como público', styles['H1x']), Paragraph('La jornada pública no requiere sesión y se puede compartir con jugadores, familias o encargados.', styles['Bodyx']),
          step(1,'Abrir la página pública','Visita https://master-flag-league.vercel.app/jornada.'),
          step(2,'Ubicar la jornada','La aplicación selecciona automáticamente la jornada vigente. El scrimmage aparece junto con los demás partidos publicados.'),
          step(3,'Ver el marcador','Cuando el partido está EN VIVO o FINALIZADO se muestran los puntos de ambos equipos.'),
          step(4,'Ver touchdowns','Debajo del marcador aparece el historial de touchdowns, con el equipo que anotó y el cuarto cuando fue capturado.'),
          step(5,'Compartir','Usa el botón de compartir de la página o copia la URL para enviarla por WhatsApp. La página se actualiza automáticamente cada 15 segundos.'),
          box('Lo que el público no ve', 'La vista pública no muestra jugadores, documentos, finanzas ni nombres de árbitros. Solo presenta la información necesaria del partido y sus jugadas.'), PageBreak()]

story += [Paragraph('5. Problemas frecuentes', styles['H1x']),
          Paragraph('<b>No aparece la temporada activa.</b><br/>El administrador debe activar una temporada desde Configuración > Temporadas.', styles['Bodyx']),
          Paragraph('<b>No aparece ninguna categoría.</b><br/>Crea una categoría dentro de la temporada activa y vuelve a abrir Scrimmages.', styles['Bodyx']),
          Paragraph('<b>No veo el scrimmage en Modo árbitro.</b><br/>Comprueba que el partido fue creado y que su jornada está publicada. Un administrador siempre puede verlo; una cuenta de árbitro debe tener el rol REFEREE.', styles['Bodyx']),
          Paragraph('<b>El marcador público no cambia.</b><br/>Espera hasta 15 segundos, actualiza la página y confirma que el árbitro guardó la jugada. Si el partido sigue programado, primero hay que iniciarlo.', styles['Bodyx']),
          Paragraph('<b>Quiero eliminar un equipo temporal.</b><br/>Los equipos con partidos conservan su historial y no deben borrarse. Los equipos sin partidos pueden eliminarse desde Administración > Equipos, si la función está habilitada.', styles['Bodyx']),
          Spacer(1,0.2*inch), box('Flujo rápido para una prueba', 'Administrador crea scrimmage > abre Modo árbitro > inicia partido > registra touchdown > abre /jornada en otro dispositivo > verifica marcador y touchdown > finaliza partido.'),
          Spacer(1,0.3*inch), Paragraph('Versión del manual: septiembre de 2026', styles['Smallx'])]

doc=SimpleDocTemplate(str(OUT), pagesize=letter, rightMargin=0.65*inch, leftMargin=0.65*inch, topMargin=0.62*inch, bottomMargin=0.72*inch, title='Manual de usuario - Scrimmages Master Flag League', author='Master Flag League')
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(OUT)
