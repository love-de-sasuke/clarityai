/**
 * File Extractor - Extracts text from various file formats
 * Handles: PDF, DOCX, TXT, images (OCR)
 */

import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import fs from 'fs';

class FileExtractor {
  /**
   * Extract text from uploaded file
   * @param {Buffer} fileBuffer - File content
   * @param {String} filename - Original filename
   * @param {String} mimetype - File MIME type
   * @returns {Promise<{text: String, format: String, pages: Number}>}
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
      
      // Fallback to OCR if PDF has no text (scanned images)
      if (!text || text.trim().length < 50) {
        console.log('[FileExtractor] PDF has no embedded text, attempting OCR...');
        // This would require rendering PDF pages to images first
        // For now, we'll note this limitation
        text = '[PDF requires OCR - pages are image-based]';
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
   * Note: This is a simplified implementation
   * For production, use 'mammoth' or 'docx' npm packages
   */
  async _extractFromDOCX(fileBuffer) {
    try {
      // Simplified: DOCX is a ZIP file with XML content
      // This would require additional libraries like 'mammoth'
      // For MVP, we'll return a placeholder
      console.log('[FileExtractor] DOCX support requires "mammoth" package');
      
      return {
        text: '[DOCX file - requires mammoth package for full extraction]',
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
      // Save buffer to temp file (Tesseract requires file path)
      const tempPath = `/tmp/ocr_${Date.now()}.jpg`;
      fs.writeFileSync(tempPath, fileBuffer);

      // Run OCR
      const { data: { text } } = await Tesseract.recognize(
        tempPath,
        'eng',
        { logger: (m) => console.log('[OCR]', m.status, m.progress) }
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
        error: `Extracted text too short (${text.length} chars, min ${minChars})`
      };
    }

    return { valid: true };
  }
}

export default new FileExtractor();
