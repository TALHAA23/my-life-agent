import { NextRequest, NextResponse } from "next/server";
import { processAndStoreDocument } from "@/lib/rag-processing";
import PDFParser from "pdf2json";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const category = formData.get("category") as string;
    const tags = formData.get("tags") as string;
    const importance = formData.get("importance") as string;
    const referenceDate = formData.get("referenceDate") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    let textContent = "";

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (file.type === "application/pdf") {
      // Promisify pdf2json
      textContent = await new Promise((resolve, reject) => {
        const pdfParser = new PDFParser(null, true); // 1 = text only

        pdfParser.on("pdfParser_dataError", (errData: any) =>
          reject(new Error(errData.parserError))
        );

        pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
          // pdfData.formImage.Pages is an array of pages
          // Each page has Texts
          // simplerraw approach: use getRawTextContent() if available or parse the JSON
          // pdf2json output is raw text content in URI encoded format often or structure

          // Actually, let's use the 'text' content extraction mode easier.
          // The "1" in constructor means text mode... wait, no.
          // constructor option 1 means "text only"?

          // Actually: pdfParser.getRawTextContent() returns string.
          resolve(pdfParser.getRawTextContent());
        });

        pdfParser.parseBuffer(buffer);
      });
    } else {
      // Assume text/plain or markdown
      textContent = buffer.toString("utf-8");
    }

    if (!textContent || !textContent.trim()) {
      return NextResponse.json(
        { error: "File has no text content" },
        { status: 400 }
      );
    }

    // pdf2json text might need some cleanup (separators, etc)
    // but getRawTextContent usually gives a decent dump.

    console.log("Extracted text length:", textContent.length);
    console.log("Extracted text preview:", textContent.substring(0, 200));

    // Prepare Metadata
    const metadata = {
      source: file.name,
      category: category || "Uncategorized",
      tags: tags ? tags.split(",").map((t) => t.trim()) : [],
      importance: importance ? parseInt(importance) : 5,
      referenceDate: referenceDate || new Date().toISOString(),
      uploadDate: new Date().toISOString(),
    };

    // Offload to modular logic
    const chunkCount = await processAndStoreDocument(textContent, metadata);

    return NextResponse.json({
      success: true,
      chunks: chunkCount,
      message: "File processed and stored!",
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
