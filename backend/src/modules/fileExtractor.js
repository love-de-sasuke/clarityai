/**
 * File Extractor - Extracts text from various file formats
 * Handles: PDF, DOCX, TXT, images (OCR)
 */

import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';
import mammoth from 'mammoth'; // Implementation added
import fs from 'fs';
import os from 'os';
import path from 'path';

class FileExtractor {
  async extractText(fileBuffer, filename, mimetype) {
    try {
      if (mimetype === 'application/pdf' || filename.endsWith('.pdf')) {
        return await this._extractFromPDF(fileBuffer);
      }
      
      if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
          filename.endsWith('.docx')) {
        return await this._extractFromDOCX(fileBuffer);
      }
      
      if (mimetype.startsWith('image/') || filename.match(/\\.(png|jpg|jpeg|gif|bmp)$/i)) {
        return await this._extractFromImage(fileBuffer);
      }

      if (mimetype === 'text/plain' || filename.endsWith('.txt')) {
        return {
          text: fileBuffer.toString('utf-8'),
          format: 'txt',
          pages: 1
        };
      }

      throw new Error('Unsupported file format');
    } catch (error) {
      console.error('[FileExtractor] Error:', error.message);
      throw error;
    }
  }

  async _extractFromPDF(fileBuffer) {
    try {
      const data = await pdfParse(fileBuffer);
      let text = data.text;

      // Lowered threshold to 10 chars to avoid false negatives on small docs
      if (!text || text.trim().length < 10) {
        return { text: "[Empty or Scanned PDF - OCR required]", format: 'pdf', pages: data.numpages };
      }

      return { text: text, format: 'pdf', pages: data.numpages };
    } catch (error) {
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  async _extractFromDOCX(fileBuffer) {
    try {
      // FIXED: Actually using mammoth to extract text
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return {
        text: result.value,
        format: 'docx',
        pages: 1
      };
    } catch (error) {
      throw new Error(`DOCX extraction failed: ${error.message}`);
    }
  }

  async _extractFromImage(fileBuffer) {
    // FIXED: Using os.tmpdir() for cross-platform compatibility (Windows/Linux)
    const tempPath = path.join(os.tmpdir(), `ocr_${Date.now()}.jpg`);
    try {
      fs.writeFileSync(tempPath, fileBuffer);

      const { data: { text } } = await Tesseract.recognize(
        tempPath,
        'eng'
      );

      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

      if (!text || text.trim().length < 5) {
        throw new Error('OCR extracted no readable text');
      }

      return { text, format: 'image', pages: 1 };
    } catch (error) {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      throw new Error(`Image OCR failed: ${error.message}`);
    }
  }
}

export default new FileExtractor();
