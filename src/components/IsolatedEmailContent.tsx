import React, { useRef, useEffect } from 'react';

interface IsolatedEmailContentProps {
  content: string;
}

const IsolatedEmailContent: React.FC<IsolatedEmailContentProps> = ({ content }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (iframeRef.current) {
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      
      if (doc) {
        // Sanitize and clean email content
        const sanitizeContent = (htmlContent: string): string => {
          // Remove script tags and dangerous elements
          let cleaned = htmlContent
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<link[^>]*>/gi, '')
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
            .replace(/on\w+\s*=\s*'[^']*'/gi, '');
          
          // Fix common encoding issues
          cleaned = cleaned
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
          
          return cleaned;
        };

        // Create completely isolated HTML with refined styles
        const isolatedHTML = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              /* Complete CSS reset and normalization */
              * {
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                font-size: 100% !important;
                font: inherit !important;
                vertical-align: baseline !important;
                box-sizing: border-box !important;
              }
              
              /* Force override any inline styles */
              *[style] {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
              }
              
              /* Base container and body */
              html, body {
                width: 100% !important;
                height: auto !important;
                margin: 0 !important;
                padding: 0 !important;
                isolation: isolate !important;
                contain: layout style paint !important;
              }
              
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                font-size: 15px !important;
                line-height: 1.7 !important;
                color: #2d3748 !important;
                background: transparent !important;
                padding: 24px !important;
                overflow-wrap: break-word !important;
                word-wrap: break-word !important;
                word-break: break-word !important;
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                text-rendering: optimizeLegibility !important;
              }
              
              .email-content {
                max-width: 100% !important;
                overflow: hidden !important;
              }
              
              /* Typography with forced overrides */
              p {
                margin: 0 0 18px 0 !important;
                padding: 0 !important;
                line-height: 1.7 !important;
                font-size: 15px !important;
                color: #2d3748 !important;
                font-family: inherit !important;
              }
              
              p:last-child {
                margin-bottom: 0 !important;
              }
              
              p:empty {
                margin: 0 !important;
                display: none !important;
              }
              
              h1, h2, h3, h4, h5, h6 {
                margin: 24px 0 16px 0 !important;
                padding: 0 !important;
                font-weight: 600 !important;
                line-height: 1.4 !important;
                color: #1a202c !important;
                font-family: inherit !important;
              }
              
              h1 { font-size: 28px !important; }
              h2 { font-size: 24px !important; }
              h3 { font-size: 20px !important; }
              h4 { font-size: 18px !important; }
              h5 { font-size: 16px !important; }
              h6 { font-size: 15px !important; }
              
              /* Links */
              a {
                color: #3182ce !important;
                text-decoration: underline !important;
                transition: all 0.2s ease !important;
                font-family: inherit !important;
                word-break: break-all !important;
              }
              
              a:hover {
                color: #2c5282 !important;
                text-decoration: none !important;
              }
              
              /* Enhanced image handling */
              img {
                max-width: 100% !important;
                height: auto !important;
                display: block !important;
                margin: 16px auto !important;
                border-radius: 8px !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1) !important;
                transition: all 0.3s ease !important;
                border: none !important;
                padding: 0 !important;
              }
              
              /* Hide problematic images */
              img[src=""], 
              img:not([src]), 
              img[src*="cid:"],
              img[src*="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP"],
              img[width="1"],
              img[height="1"],
              img[style*="width: 1px"],
              img[style*="height: 1px"],
              img[style*="width:1px"],
              img[style*="height:1px"] {
                display: none !important;
                visibility: hidden !important;
              }
              
              /* Tables with better styling */
              table {
                border-collapse: collapse !important;
                width: 100% !important;
                margin: 20px 0 !important;
                border-radius: 8px !important;
                overflow: hidden !important;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
                background: #ffffff !important;
                border: none !important;
                font-family: inherit !important;
              }
              
              td, th {
                padding: 14px 18px !important;
                text-align: left !important;
                border-bottom: 1px solid #e2e8f0 !important;
                vertical-align: top !important;
                font-family: inherit !important;
                font-size: 15px !important;
                line-height: 1.6 !important;
              }
              
              th {
                background: #f7fafc !important;
                font-weight: 600 !important;
                color: #2d3748 !important;
                border-bottom: 2px solid #e2e8f0 !important;
              }
              
              tr:last-child td {
                border-bottom: none !important;
              }
              
              tr:nth-child(even) {
                background: #f8f9fa !important;
              }
              
              /* Lists with proper spacing */
              ul, ol {
                margin: 18px 0 !important;
                padding-left: 28px !important;
                font-family: inherit !important;
              }
              
              li {
                margin-bottom: 8px !important;
                line-height: 1.7 !important;
                font-size: 15px !important;
                color: #2d3748 !important;
                font-family: inherit !important;
              }
              
              li:last-child {
                margin-bottom: 0 !important;
              }
              
              /* Enhanced blockquotes */
              blockquote {
                margin: 24px 0 !important;
                padding: 20px 24px !important;
                border-left: 4px solid #4299e1 !important;
                background: #ebf8ff !important;
                border-radius: 0 8px 8px 0 !important;
                font-style: italic !important;
                color: #2b6cb0 !important;
                font-family: inherit !important;
                position: relative !important;
              }
              
              /* Code with better styling */
              code {
                font-family: 'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
                background: #f1f5f9 !important;
                border-radius: 4px !important;
                padding: 3px 6px !important;
                font-size: 13px !important;
                color: #d63384 !important;
                border: 1px solid #e2e8f0 !important;
              }
              
              pre {
                font-family: 'Fira Code', 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
                background: #1a202c !important;
                color: #e2e8f0 !important;
                border-radius: 8px !important;
                padding: 20px !important;
                margin: 20px 0 !important;
                overflow-x: auto !important;
                border: none !important;
                line-height: 1.6 !important;
                font-size: 14px !important;
              }
              
              pre code {
                background: transparent !important;
                color: inherit !important;
                padding: 0 !important;
                border: none !important;
                border-radius: 0 !important;
              }
              
              /* Dividers */
              hr {
                margin: 32px 0 !important;
                border: none !important;
                height: 2px !important;
                background: linear-gradient(to right, transparent, #e2e8f0, transparent) !important;
                border-radius: 2px !important;
              }
              
              /* Email signatures and footers */
              .signature, 
              div[style*="font-size: 12px"],
              div[style*="font-size: 11px"],
              div[style*="font-size:12px"],
              div[style*="font-size:11px"] {
                margin-top: 32px !important;
                padding-top: 20px !important;
                border-top: 1px solid #e2e8f0 !important;
                font-size: 13px !important;
                color: #718096 !important;
                font-family: inherit !important;
              }
              
              /* Force override problematic inline styles */
              [style*="font-family"],
              [style*="font-size"],
              [style*="color"],
              [style*="background"] {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
              }
              
              /* Fix Outlook and Exchange quirks */
              o\\:p { display: none !important; }
              .MsoNormal { margin: 0 !important; }
              
              /* Handle nested tables (common in email templates) */
              table table {
                margin: 0 !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }
              
              table table td {
                border: none !important;
                background: transparent !important;
              }
              
              /* Remove any remaining styling conflicts */
              span[style] {
                all: unset !important;
                font-family: inherit !important;
                color: inherit !important;
                font-size: inherit !important;
              }
              
              div[style] {
                background: none !important;
                font-family: inherit !important;
              }
              
              /* Center content nicely */
              center {
                text-align: center !important;
                width: 100% !important;
              }
              
              /* Handle empty paragraphs and divs */
              p:empty, div:empty {
                display: none !important;
              }
              
              /* Ensure consistent spacing */
              br + br {
                display: none !important;
              }
            </style>
          </head>
          <body>
            <div class="email-content">
              ${sanitizeContent(content) || '<p style="color: #718096; font-style: italic; text-align: center; margin-top: 40px;">No content available</p>'}
            </div>
          </body>
          </html>
        `;
        
        doc.open();
        doc.write(isolatedHTML);
        doc.close();
        
        // Auto-resize iframe to content height
        const resizeIframe = () => {
          const body = doc.body;
          if (body) {
            const height = Math.max(
              body.scrollHeight,
              body.offsetHeight,
              200 // minimum height
            );
            iframe.style.height = `${height + 40}px`; // Add padding
          }
        };
        
        // Handle image loading and errors
        const handleImages = () => {
          const images = doc.querySelectorAll('img');
          images.forEach((img) => {
            // Remove tracking pixels
            if (img.width === 1 || img.height === 1) {
              img.remove();
              return;
            }
            
            // Handle CID references and broken images
            if (!img.src || img.src.includes('cid:') || img.src === '') {
              img.style.display = 'none';
              return;
            }
            
            // Add loading state
            img.style.opacity = '0';
            
            img.onload = () => {
              img.style.opacity = '1';
              resizeIframe();
            };
            
            img.onerror = () => {
              img.style.display = 'none';
              resizeIframe();
            };
          });
        };
        
        // Initial setup
        setTimeout(() => {
          handleImages();
          resizeIframe();
        }, 100);
        
        // Resize on content changes
        const observer = new MutationObserver(() => {
          handleImages();
          resizeIframe();
        });
        observer.observe(doc.body, { 
          childList: true, 
          subtree: true, 
          attributes: true 
        });
        
        // Prevent navigation and handle clicks
        iframe.contentWindow?.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === 'A') {
            e.preventDefault();
            const href = (target as HTMLAnchorElement).href;
            if (href && (href.startsWith('http') || href.startsWith('mailto:'))) {
              window.open(href, '_blank', 'noopener,noreferrer');
            }
          }
        });
        
        return () => observer.disconnect();
      }
    }
  }, [content]);

  return (
    <iframe
      ref={iframeRef}
      style={{
        width: '100%',
        minHeight: '200px',
        border: 'none',
        background: 'transparent',
        isolation: 'isolate',
        contain: 'layout style paint size'
      }}
      sandbox="allow-same-origin"
      title="Email Content"
    />
  );
};

export default IsolatedEmailContent;