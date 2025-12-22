import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import mammoth from 'mammoth'; // Ensure this is imported
import fs from 'fs';

// ... inside FileExtractor class

  /**
   * FIXED: Extract text from DOCX using mammoth
   */
  async _extractFromDOCX(fileBuffer) {
    try {
      // Use mammoth to convert buffer to raw text
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      
      return {
        text: result.value, // This is the actual text content
        format: 'docx',
        pages: 1 // Mammoth doesn't easily provide page counts
      };
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  /**
   * FIXED: Lower the threshold for PDF text validation
   */
  async _extractFromPDF(fileBuffer) {
    try {
      const data = await pdfParse(fileBuffer);
      let text = data.text;

      // Logic check: If text is very short, it's likely a scanned image
      // Reduced threshold from 50 to 10 characters
      if (!text || text.trim().length < 10) {
         // In a real app, you'd trigger OCR here
         return { text: "[Scanned PDF - requires OCR]", format: 'pdf', pages: data.numpages };
      }

      return {
        text: text,
        format: 'pdf',
        pages: data.numpages
      };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }
