// Direct PDF processing test without database dependency

const fs = require('fs').promises;
const path = require('path');
const pdfParse = require('pdf-parse');

async function testDirectProcessing() {
  console.log('🧪 Starting direct PDF processing test...');
  
  try {
    // Check for PDF files in uploads directory
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    
    console.log(`📁 Checking uploads directory: ${uploadsDir}`);
    
    try {
      const files = await fs.readdir(uploadsDir);
      const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
      
      console.log(`📋 Found ${pdfFiles.length} PDF files:`);
      pdfFiles.forEach(file => console.log(`  - ${file}`));
      
      if (pdfFiles.length === 0) {
        console.log('❌ No PDF files found in uploads directory');
        return;
      }
      
      // Test with the first PDF file found
      const testFile = pdfFiles[0];
      const filePath = path.join(uploadsDir, testFile);
      
      console.log(`\n🔧 Testing with file: ${testFile}`);
      
      // Read file
      const pdfBuffer = await fs.readFile(filePath);
      console.log(`📏 File size: ${pdfBuffer.length} bytes`);
      
      // Process with pdf-parse
      console.log('⚙️  Processing with pdf-parse...');
      const startTime = Date.now();
      
      const pdfData = await pdfParse(pdfBuffer, {
        max: 0, // Parse all pages
        render_page: (pageData) => {
          return pageData.getTextContent().then((textContent) => {
            let lastY = null;
            let text = '';
            
            for (let item of textContent.items) {
              if (lastY !== null && item.transform[5] !== lastY) {
                text += '\n';
              }
              text += item.str;
              lastY = item.transform[5];
            }
            
            return text;
          });
        }
      });
      
      const processingTime = Date.now() - startTime;
      
      console.log('✅ Processing completed successfully!');
      console.log(`⏱️  Processing time: ${processingTime}ms`);
      console.log(`📄 Number of pages: ${pdfData.numpages}`);
      console.log(`📝 Text length: ${pdfData.text.length} characters`);
      console.log(`🔢 PDF version: ${pdfData.version || 'Unknown'}`);
      
      // Show metadata
      if (pdfData.info) {
        console.log('\n📊 Metadata:');
        Object.entries(pdfData.info).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
      }
      
      // Show first 200 characters of extracted text
      if (pdfData.text.length > 0) {
        console.log('\n📝 Text preview (first 200 chars):');
        console.log(pdfData.text.substring(0, 200) + '...');
      } else {
        console.log('\n⚠️  No text was extracted from the PDF');
      }
      
      // Test extractMetadata function
      console.log('\n🏷️  Testing metadata extraction...');
      const extractedMetadata = extractMetadata(pdfData.info || {});
      console.log(JSON.stringify(extractedMetadata, null, 2));
      
    } catch (dirError) {
      console.error(`❌ Error accessing uploads directory: ${dirError.message}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

/**
 * Extract and format metadata from PDF info (same as in pdfProcessor)
 * @param {Object} pdfInfo - PDF info object from pdf-parse
 * @returns {Object} Formatted metadata
 */
function extractMetadata(pdfInfo) {
  return {
    title: pdfInfo.Title || null,
    author: pdfInfo.Author || null,
    subject: pdfInfo.Subject || null,
    keywords: pdfInfo.Keywords || null,
    creator: pdfInfo.Creator || null,
    producer: pdfInfo.Producer || null,
    creation_date: pdfInfo.CreationDate ? new Date(pdfInfo.CreationDate) : null,
    modification_date: pdfInfo.ModDate ? new Date(pdfInfo.ModDate) : null,
    pdf_version: pdfInfo.PDFFormatVersion || null,
    is_encrypted: pdfInfo.IsEncrypted || false,
    is_linearized: pdfInfo.IsLinearized || false,
    page_layout: pdfInfo.PageLayout || null,
    page_mode: pdfInfo.PageMode || null
  };
}

// Run test if called directly
if (require.main === module) {
  testDirectProcessing();
}

module.exports = { testDirectProcessing };