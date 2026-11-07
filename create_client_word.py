from pathlib import Path
from math import ceil
from PIL import Image
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

root=Path(__file__).parent
output=root/'Solarzed-Website-Presentation.docx'
qa=root/'word-qa'
qa.mkdir(exist_ok=True)
doc=Document()
section=doc.sections[0]
section.page_width=Inches(8.27)
section.page_height=Inches(11.69)
section.top_margin=section.bottom_margin=Inches(.62)
section.left_margin=section.right_margin=Inches(.75)
for name in ['Normal','Title','Heading 1','Heading 2','Caption']:
    style=doc.styles[name]
    style.font.name='Tahoma'
    style.font.color.rgb=RGBColor(0,0,0)
    rpr=style.element.get_or_add_rPr()
    fonts=rpr.find(qn('w:rFonts'))
    if fonts is None:
        fonts=OxmlElement('w:rFonts');rpr.insert(0,fonts)
    for key in ['ascii','hAnsi','cs','eastAsia']:
        fonts.set(qn('w:'+key),'Tahoma')
doc.styles['Normal'].font.size=Pt(11)
doc.styles['Normal'].paragraph_format.line_spacing=1.25
doc.styles['Normal'].paragraph_format.space_after=Pt(7)
doc.styles['Title'].font.size=Pt(21)
doc.styles['Title'].paragraph_format.space_after=Pt(9)
doc.styles['Heading 1'].font.size=Pt(14)
doc.styles['Heading 1'].paragraph_format.space_before=Pt(5)
doc.styles['Heading 1'].paragraph_format.space_after=Pt(7)

def paragraph(text,style=None):
    p=doc.add_paragraph(text,style)
    p.alignment=WD_ALIGN_PARAGRAPH.RIGHT
    bidi=OxmlElement('w:bidi');bidi.set(qn('w:val'),'1');p._p.get_or_add_pPr().append(bidi)
    for run in p.runs:
        rtl=OxmlElement('w:rtl');rtl.set(qn('w:val'),'1');run._r.get_or_add_rPr().append(rtl)
    return p

items=[
('01-home.jpg','صفحه اصلی','معرفی برند سولارزد با رنگ‌های سفید، فیروزه‌ای و سرمه‌ای، تصویر خودرو و دسترسی مستقیم به ثبت و استعلام گارانتی. بخش‌های بعدی خدمات و مراحل ثبت نصب را توضیح می‌دهند.'),
('02-register.jpg','ثبت گارانتی توسط فروشنده','فرم ثبت مشخصات خودرو، مشتری، فیلم شیشه‌دودی و فروشنده. شیشه‌های جانبی و شیشه بزرگ عقب روی نمای خودرو انتخاب می‌شوند. خلاصه انتخاب‌ها و وضعیت پیامک فروشنده در پایین فرم قرار دارد. اتصال پیامک هنوز تکمیل نشده است.'),
('03-verify.jpg','استعلام گارانتی','کاربر با وارد کردن کد پیگیری می‌تواند سابقه نصب را پیدا کند. فرم ساده و راهنمای دریافت کد، مسیر دسترسی به مشخصات ثبت‌شده را مشخص می‌کنند.'),
('04-warranty-guide.jpg','راهنمای گارانتی','معرفی مدارک لازم، نحوه پیگیری خدمات و پاسخ به پرسش‌های رایج. مدت، پوشش و استثناهای نهایی گارانتی پس از تأیید سولارزد در این بخش درج می‌شوند.'),
('05-contact.jpg','تماس و پشتیبانی','مسیرهای جداگانه برای مشتریان و فروشندگان، همراه با فرم پیشنهادی درخواست پشتیبانی. اطلاعات تماس رسمی پس از اعلام کارفرما درج می‌شود. فرم تماس در نسخه فعلی نمایشی است.'),
('06-sample-result.jpg','نمونه نتیجه استعلام','نمایش اطلاعات خودرو، مدل فیلم، تاریخ نصب، فروشنده و شیشه‌های ثبت‌شده، همراه با امکان دریافت تأییدیه. اطلاعات این تصویر آزمایشی است و به مشتری واقعی تعلق ندارد.')]

paragraph('معرفی طرح سایت سولارزد','Title')
paragraph('این سند برای بررسی طراحی سایت و ارائه به کارفرما تهیه شده است و تصاویر پنج صفحه اصلی و یک نمونه نتیجه استعلام را همراه با توضیح فارسی نشان می‌دهد.')

page_count=0
for number,(filename,title,description) in enumerate(items,1):
    image=Image.open(root/'client-screenshots'/filename)
    width,height=image.size
    parts=ceil(height/1580)
    for part in range(parts):
        if page_count:
            doc.add_page_break()
        label=title if part==0 else title+' ادامه'
        paragraph(label,'Heading 1')
        if part==0:
            paragraph(description)
        else:
            paragraph('ادامه تصویر همان صفحه به ترتیب از بالا به پایین')
        top=round(part*height/parts)
        bottom=round((part+1)*height/parts)
        crop_path=qa/f'image-{number}-{part+1}.jpg'
        image.crop((0,top,width,bottom)).save(crop_path,quality=96)
        picture_p=doc.add_paragraph()
        picture_p.alignment=WD_ALIGN_PARAGRAPH.CENTER
        picture_p.paragraph_format.space_after=Pt(0)
        picture_p.paragraph_format.line_spacing=1
        run=picture_p.add_run()
        inline=run.add_picture(str(crop_path),width=Inches(6.4))
        inline._inline.docPr.set('descr',title+f' بخش {part+1} از {parts}')
        page_count+=1

doc.core_properties.title='معرفی طرح سایت سولارزد'
doc.core_properties.subject='تصاویر صفحات سایت و توضیحات فارسی برای ارائه به کارفرما'
doc.core_properties.author='Solarzed'
doc.core_properties.keywords='Solarzed, website, warranty, design'
doc.save(output)
print(f'Created {output.name}; planned pages: {page_count}; image segments: {page_count}')
