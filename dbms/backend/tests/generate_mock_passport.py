import argparse
from PIL import Image, ImageDraw, ImageFont
import os

def create_mock_passport(name, pno, photo_path=None, output_path="mock_passport.png"):
    # Create a blank white passport-sized image
    img = Image.new('RGB', (600, 400), color='white')
    d = ImageDraw.Draw(img)
    
    # Try to load a font, fallback to default
    try:
        font = ImageFont.truetype("Arial", 20)
        title_font = ImageFont.truetype("Arial", 24)
    except:
        font = ImageFont.load_default()
        title_font = ImageFont.load_default()
    
    # Draw passport header
    d.text((200, 20), "REPUBLIC OF INDIA", fill='black', font=title_font)
    d.text((230, 50), "PASSPORT", fill='black', font=title_font)
    
    # Draw details
    d.text((200, 100), "Surname / Nom", fill='gray', font=font)
    surname = name.split()[-1] if len(name.split()) > 1 else name
    d.text((200, 120), surname.upper(), fill='black', font=font)
    
    d.text((200, 160), "Given Name(s) / Prenom(s)", fill='gray', font=font)
    given_name = " ".join(name.split()[:-1]) if len(name.split()) > 1 else ""
    d.text((200, 180), given_name.upper(), fill='black', font=font)
    
    d.text((450, 100), "Passport No.", fill='gray', font=font)
    d.text((450, 120), pno, fill='black', font=font)
    
    # Paste a dummy photo box or real photo
    if photo_path and os.path.exists(photo_path):
        try:
            photo = Image.open(photo_path)
            photo = photo.resize((140, 180))
            img.paste(photo, (30, 90))
        except Exception as e:
            d.rectangle([30, 90, 170, 270], outline="black")
            d.text((50, 170), "PHOTO", fill="black", font=font)
    else:
        d.rectangle([30, 90, 170, 270], outline="black")
        d.text((50, 170), "PHOTO", fill="black", font=font)
        
    # Draw fake MRZ
    mrz1 = f"P<IND{surname.upper()}<<{given_name.upper()}"
    mrz1 = mrz1.ljust(44, '<')
    mrz2 = f"{pno}4IND8803154M3101118<<<<<<<<<<<<<<<6"
    
    d.text((30, 320), mrz1, fill='black', font=font)
    d.text((30, 350), mrz2, fill='black', font=font)
    
    img.save(output_path)
    print(f"Mock passport saved to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a mock passport image.")
    parser.add_argument("--name", type=str, default="Vikram Singh", help="Name on the passport (e.g., 'Vikram Singh')")
    parser.add_argument("--pno", type=str, default="Z8892104", help="Passport number (e.g., 'Z8892104')")
    parser.add_argument("--photo", type=str, default=None, help="Path to a user photo to paste onto the passport")
    parser.add_argument("--out", type=str, default="../mock_passport.png", help="Output file path")
    args = parser.parse_args()

    create_mock_passport(args.name, args.pno, args.photo, args.out)

