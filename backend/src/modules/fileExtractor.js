/**
 * File Extractor - Extracts text from various file formats
 */

import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import fs from 'fs';

class FileExtractor {
  /**
   * Extract text from uploaded file
   */
  async extractText(fileBuffer, filename, mimetype) {
    try {
      if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
        return await this._extractFromPDF(fileBuffer);
      }
      
      if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
          filename.endsWith('.docx')) {
        return await this._extractFromDOCX(fileBuffer);
      }
      
      if (mimetype.startsWith('image/') || filename.match(/\.(png|jpg|jpeg|gif|bmp)$/i)) {
        return await this._extractFromImage(fileBuffer);
      }

      if (mimetype === 'text/plain' || filename.endsWith('.txt')) {
        return {
          text: fileBuffer.toString('utf-8'),
          format: 'txt',
          pages: 1
        };
      }

      throw new Error(`Unsupported file type: ${mimetype}`);
    } catch (error) {
      throw new Error(`File extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from PDF
   */
  async _extractFromPDF(fileBuffer) {
    try {
      const data = await pdfParse(fileBuffer);
      
      let text = data.text || '';
      
      // Fallback to OCR if PDF has no text
      if (!text || text.trim().length < 50) {
        console.log('[FileExtractor] PDF has no embedded text, image-based PDF detected');
        text = '[PDF appears to be image-based - consider using OCR software]';
      }

      return {
        text,
        format: 'pdf',
        pages: data.numpages || 1
      };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from DOCX
   */
  async _extractFromDOCX(fileBuffer) {
    try {
      // Check if mammoth is available
      let mammoth;
      try {
        mammoth = await import('mammoth');
      } catch {
        console.log('[FileExtractor] mammoth package not installed, using basic DOCX extraction');
        
        // Basic extraction: DOCX is a ZIP with XML, try to extract text from the raw buffer
        const text = fileBuffer.toString('utf-8', 0, Math.min(10000, fileBuffer.length));
        // This is very basic and won't work well for real DOCX files
        // Install mammoth for proper DOCX support: npm install mammoth
        
        return {
          text: '[DOCX file - install mammoth package for proper text extraction]\n' + 
                'To install: npm install mammoth\n' +
                'Basic extracted content (first 10k bytes):\n' + text.substring(0, 1000),
          format: 'docx',
          pages: 1
        };
      }
      
      // Use mammoth if available
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return {
        text: result.value || '[No text extracted from DOCX]',
        format: 'docx',
        pages: 1
      };
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  /**
   * Extract text from image using Tesseract OCR
   */
  async _extractFromImage(fileBuffer) {
    try {
      // Save buffer to temp file
      const tempPath = `/tmp/ocr_${Date.now()}.jpg`;
      fs.writeFileSync(tempPath, fileBuffer);

      // Run OCR
      const { data: { text } } = await Tesseract.recognize(
        tempPath,
        'eng',
        { 
          logger: (m) => {
            if (m.status === 'recognizing text' && m.progress % 20 === 0) {
              console.log(`[OCR] Progress: ${m.progress}%`);
            }
          }
        }
      );

      // Cleanup temp file
      fs.unlinkSync(tempPath);

      if (!text || text.trim().length < 20) {
        throw new Error('OCR extracted no readable text');
      }

      return {
        text,
        format: 'image',
        pages: 1
      };
    } catch (error) {
      throw new Error(`Image OCR failed: ${error.message}`);
    }
  }

  /**
   * Validate extracted text quality
   */
  validateExtraction(text, minChars = 50) {
    if (!text || text.trim().length < minChars) {
      return {
        valid: false,
        error: `Extracted text too short (${text ? text.length : 0} chars, min ${minChars})`
      };
    }

    return { valid: true };
  }
}

export default new FileExtractor();
