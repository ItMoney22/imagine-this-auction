# CSV Lot Upload Guide

This guide explains how to bulk upload lots to your auctions using CSV files.

## Overview

The CSV upload feature allows auctioneers to quickly add multiple lots to an auction by uploading a properly formatted CSV file. The system provides real-time validation, error reporting, and allows partial imports when some rows contain errors.

## CSV Format Requirements

### Required Columns

Your CSV file must include these columns in any order:

- **title** - The lot title (required)
- **description** - Detailed lot description (required)
- **image_urls** - Comma-separated list of image URLs
- **start_price_itc** - Starting bid price in ITC credits (required, positive integer)
- **bid_increment_itc** - Minimum bid increment in ITC credits (required, positive integer)

### Optional Columns

- **reserve_price_itc** - Reserve price in ITC credits (only if auction allows reserves)
- **category** - Lot category for filtering and organization

### Column Details

#### title
- **Type**: Text
- **Max Length**: 255 characters
- **Required**: Yes
- **Example**: `"Antique Oak Dining Table"`

#### description
- **Type**: Text
- **Max Length**: 2000 characters
- **Required**: Yes
- **Example**: `"Beautiful solid oak dining table from the 1920s. Seats 6 comfortably. Minor scratches on surface, otherwise excellent condition. Dimensions: 72\" x 36\" x 30\""`

#### image_urls
- **Type**: Comma-separated URLs
- **Required**: No
- **Format**: Each URL should be publicly accessible
- **Example**: `"https://example.com/table1.jpg,https://example.com/table2.jpg,https://example.com/table3.jpg"`

#### start_price_itc
- **Type**: Positive integer
- **Required**: Yes
- **Minimum**: 1 ITC
- **Example**: `100`

#### bid_increment_itc
- **Type**: Positive integer
- **Required**: Yes
- **Minimum**: 1 ITC
- **Example**: `10`

#### reserve_price_itc
- **Type**: Positive integer
- **Required**: No (only if auction allows reserves)
- **Must be**: Greater than start_price_itc
- **Example**: `150`

#### category
- **Type**: Text
- **Required**: No
- **Max Length**: 100 characters
- **Example**: `"Furniture"`, `"Collectibles"`, `"Art"`

## Sample CSV File

```csv
title,description,image_urls,start_price_itc,bid_increment_itc,reserve_price_itc,category
"Antique Oak Dining Table","Beautiful solid oak dining table from the 1920s. Seats 6 comfortably. Minor scratches on surface, otherwise excellent condition.","https://example.com/table1.jpg,https://example.com/table2.jpg",100,10,150,"Furniture"
"Vintage Pocket Watch","Gold-plated pocket watch from 1890s. Swiss movement, keeps accurate time. Includes original chain and box.","https://example.com/watch1.jpg,https://example.com/watch2.jpg",75,5,,"Collectibles"
"Oil Painting Landscape","Original oil painting on canvas, 24x18 inches. Depicts mountain landscape with lake. Signed by artist in bottom right corner.","https://example.com/painting.jpg",200,25,300,"Art"
"Crystal Vase Set","Set of 3 crystal vases in different sizes. No chips or cracks. Perfect for wedding centerpieces or home decoration.","https://example.com/vases.jpg",50,5,,"Home & Garden"
"First Edition Book","First edition copy of 'The Great Gatsby' by F. Scott Fitzgerald. Published 1925. Good condition with dust jacket.","https://example.com/book1.jpg,https://example.com/book2.jpg",500,50,750,"Books & Literature"
```

## Upload Process

1. **Prepare Your CSV**: Create your CSV file following the format requirements above
2. **Access Lot Manager**: Navigate to your auction and click "Lots" tab
3. **Upload File**: Click "Bulk Upload CSV" and select your file
4. **Preview & Validate**: Review the validation results
5. **Import Lots**: Confirm the import of valid lots

## Validation Process

### Real-Time Validation

The system validates each row and provides detailed feedback:

- ✅ **Valid rows**: Displayed with green background
- ❌ **Invalid rows**: Displayed with red background and error details
- ⚠️ **Warnings**: Non-critical issues that don't prevent import

### Common Validation Errors

| Error | Description | Solution |
|-------|-------------|----------|
| "Title is required" | Empty or missing title field | Add descriptive title |
| "Description is required" | Empty or missing description | Add detailed description |
| "Start price must be positive" | Invalid or negative start price | Use positive integer |
| "Bid increment must be positive" | Invalid or negative increment | Use positive integer |
| "Reserve prices not allowed" | Reserve set when auction doesn't allow | Remove reserve or enable in auction settings |
| "Reserve must be greater than start price" | Reserve price too low | Increase reserve price |
| "Invalid image URL" | Malformed or inaccessible URL | Check URL format and accessibility |

### Partial Import

- **Valid lots** will be imported successfully
- **Invalid lots** will be skipped with detailed error messages
- You can fix errors and re-upload the failed rows
- Import summary shows: "Imported 8 of 10 lots (2 skipped due to errors)"

## Best Practices

### File Preparation

1. **Use UTF-8 encoding** to support special characters
2. **Test with small batches** before uploading large files
3. **Quote text fields** that contain commas or special characters
4. **Validate image URLs** before uploading to ensure they're accessible

### Image Management

1. **Host images externally** on services like:
   - Cloudinary
   - AWS S3
   - Google Cloud Storage
   - Image hosting services

2. **Image requirements**:
   - Publicly accessible URLs
   - Common formats: JPG, PNG, WebP
   - Recommended size: 1200x1200px or larger
   - Maximum 10 images per lot

3. **Image URL format**:
   ```
   # Single image
   https://example.com/image.jpg

   # Multiple images (comma-separated)
   https://example.com/image1.jpg,https://example.com/image2.jpg,https://example.com/image3.jpg
   ```

### Pricing Strategy

1. **Start Price**: Set competitively to encourage bidding
2. **Bid Increment**: Balance between progression speed and accessibility
3. **Reserve Price**: Use sparingly and set realistically

### Categories

Use consistent category names across your lots:
- Art & Antiques
- Collectibles
- Furniture
- Jewelry & Watches
- Books & Literature
- Home & Garden
- Electronics
- Vehicles
- Sports & Recreation
- Other

## Troubleshooting

### Common Issues

**Q: CSV upload fails immediately**
A: Check file format (must be .csv), encoding (UTF-8), and file size (under 10MB)

**Q: All rows show validation errors**
A: Verify column headers match required names exactly (case-sensitive)

**Q: Images not displaying**
A: Ensure image URLs are publicly accessible and use direct links to image files

**Q: Import succeeds but lots don't appear**
A: Check auction status and permissions. Lots may be in draft status.

**Q: Reserve prices rejected**
A: Verify auction settings allow reserve prices

### Error Recovery

1. **Download error report**: System provides detailed error breakdown
2. **Fix issues in original file**: Correct validation errors
3. **Re-upload**: Upload corrected file to import remaining lots
4. **Manual entry**: For problematic lots, use individual lot creation form

## Audit Trail

All CSV uploads are logged for audit purposes:
- Original CSV file stored securely
- Import timestamp and user recorded
- Validation results and errors logged
- Number of successful/failed imports tracked

## Limits and Restrictions

- **File size**: Maximum 10MB per CSV file
- **Rows**: Maximum 1000 lots per upload
- **Processing time**: Large files may take several minutes
- **Concurrent uploads**: One upload per auction at a time
- **Image URLs**: Maximum 10 images per lot

## Support

If you encounter issues not covered in this guide:

1. Check the validation error messages for specific guidance
2. Verify your CSV format against the sample file
3. Test with a smaller subset of your data
4. Contact support with your error details and sample data

For technical support, include:
- CSV file (first 10 rows)
- Specific error messages
- Auction ID and timestamp
- Browser and operating system information