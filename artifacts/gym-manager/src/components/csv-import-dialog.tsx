import { useState, useRef, useCallback } from "react";
import { Upload, FileText, X, CheckCircle2, AlertCircle, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface ParsedRow {
  fullName: string;
  phoneNumber: string;
  startDate: string;
  duration: string;
  valid: boolean;
  error?: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  total: number;
}

function parseCSVPreview(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return [];

  const headerLine = lines[0].toLowerCase();
  const hasHeader =
    headerLine.includes("name") || headerLine.includes("phone") || headerLine.includes("full") || headerLine.includes("member");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.slice(0, 10).map((line) => {
    const fields = line.split(",").map((f) => f.replace(/^"|"$/g, "").trim());
    const isExportFormat = fields.length >= 6 && /^GYM-\d+/.test(fields[0]);

    let fullName: string, phoneNumber: string, startDate: string, duration: string;

    if (isExportFormat) {
      [, fullName, phoneNumber, startDate, , duration] = fields;
    } else {
      [fullName, phoneNumber, startDate, duration] = fields;
    }

    const errors: string[] = [];
    if (!fullName || fullName.length < 2) errors.push("invalid name");
    if (!phoneNumber || phoneNumber.length < 5) errors.push("invalid phone");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "")) errors.push("invalid date (use YYYY-MM-DD)");
    if (!duration || isNaN(parseInt(duration, 10))) errors.push("invalid duration");

    return {
      fullName: fullName ?? "",
      phoneNumber: phoneNumber ?? "",
      startDate: startDate ?? "",
      duration: duration ?? "",
      valid: errors.length === 0,
      error: errors.join(", "),
    };
  });
}

function downloadSampleCsv() {
  const header = "Full Name,Phone Number,Start Date,Duration (Months)";
  const rows = [
    '"John Smith",+1-555-0100,2024-01-15,12',
    '"Maria Garcia",+1-555-0101,2024-03-01,6',
    '"James Lee",+1-555-0102,2024-06-10,3',
  ];
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "fitness-temple-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export function CsvImportDialog({ open, onOpenChange, onImportComplete }: CsvImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const processFile = useCallback((f: File) => {
    if (!f.name.endsWith(".csv") && f.type !== "text/csv") {
      toast({ title: "Invalid file type", description: "Please upload a .csv file", variant: "destructive" });
      return;
    }
    setFile(f);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSVPreview(text);
      const total = text.split(/\r?\n/).filter((l) => l.trim() !== "").length;
      setPreview(parsed);
      setTotalRows(Math.max(0, total - 1));
    };
    reader.readAsText(f);
  }, [toast]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = e.dataTransfer.files[0];
      if (dropped) processFile(dropped);
    },
    [processFile]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  };

  const handleImport = async () => {
    if (!file) return;
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("csv", file);
      const res = await fetch("/api/members/import-csv", { method: "POST", body: formData });
      const data: ImportResult = await res.json();
      if (!res.ok) {
        toast({ title: "Import failed", description: (data as unknown as { error: string }).error, variant: "destructive" });
        return;
      }
      setResult(data);
      if (data.imported > 0) {
        onImportComplete();
        toast({ title: `Imported ${data.imported} member${data.imported !== 1 ? "s" : ""}`, description: data.skipped > 0 ? `${data.skipped} rows had errors` : "All rows imported successfully" });
      }
    } catch {
      toast({ title: "Import failed", description: "Network error — please try again", variant: "destructive" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
    setTotalRows(0);
    onOpenChange(false);
  };

  const validPreviewCount = preview.filter((r) => r.valid).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Upload className="h-5 w-5 text-primary" />
            Import Members from CSV
          </DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk-import member records into Fitness Temple.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info banner */}
          <div className="flex items-start gap-3 p-3 rounded-xl border bg-primary/5 border-primary/15 text-sm">
            <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-muted-foreground">
              <p><span className="font-medium text-foreground">Accepted formats:</span> Simple (4 cols) or Fitness Temple export (8 cols)</p>
              <p><span className="font-medium text-foreground">Simple format:</span> Full Name, Phone Number, Start Date (YYYY-MM-DD), Duration (months)</p>
              <button
                onClick={downloadSampleCsv}
                className="flex items-center gap-1.5 text-primary font-medium hover:underline"
              >
                <Download className="h-3.5 w-3.5" />
                Download sample template
              </button>
            </div>
          </div>

          {/* Drop zone */}
          {!result && (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200",
                isDragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-border hover:border-primary/50 hover:bg-muted/30",
                !file && "cursor-pointer"
              )}
            >
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />

              {!file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">Drop your CSV file here</p>
                    <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Max 10 MB</p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-sm">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB · {totalRows} data row{totalRows !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); setFile(null); setPreview([]); setResult(null); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Result state */}
          {result && (
            <div className={cn(
              "rounded-xl border p-5 space-y-3",
              result.imported > 0 ? "border-green-500/20 bg-green-500/5" : "border-destructive/20 bg-destructive/5"
            )}>
              <div className="flex items-center gap-3">
                {result.imported > 0 ? (
                  <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-destructive flex-shrink-0" />
                )}
                <div>
                  <p className="font-semibold">{result.imported > 0 ? "Import Complete" : "Nothing Imported"}</p>
                  <p className="text-sm text-muted-foreground">
                    {result.imported} imported · {result.skipped} failed · {result.total} total rows
                  </p>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-auto">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive flex items-start gap-1.5">
                      <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      {err}
                    </p>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => { setFile(null); setPreview([]); setResult(null); }}>
                  Import Another File
                </Button>
                <Button size="sm" onClick={handleClose}>Done</Button>
              </div>
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && !result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  Preview <span className="text-muted-foreground">(first {preview.length} rows)</span>
                </p>
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">
                    {validPreviewCount} valid
                  </Badge>
                  {preview.length - validPreviewCount > 0 && (
                    <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20 text-xs">
                      {preview.length - validPreviewCount} invalid
                    </Badge>
                  )}
                </div>
              </div>
              <div className="rounded-xl border overflow-hidden text-sm">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/40 border-b">
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Phone</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Start Date</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Dur.</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((row, i) => (
                      <tr key={i} className={cn(!row.valid && "bg-red-500/5")}>
                        <td className="px-3 py-2 font-medium">{row.fullName || <span className="text-muted-foreground italic">—</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.phoneNumber || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.startDate || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.duration ? `${row.duration}mo` : "—"}</td>
                        <td className="px-3 py-2">
                          {row.valid ? (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle2 className="h-3 w-3" /> OK
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-red-500" title={row.error}>
                              <AlertCircle className="h-3 w-3" /> {row.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalRows > 10 && (
                  <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                    +{totalRows - 10} more rows not shown
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          {file && !result && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {validPreviewCount} of {preview.length} visible rows look valid
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleClose} disabled={isImporting}>Cancel</Button>
                <Button onClick={handleImport} disabled={isImporting || !file}>
                  <Upload className="mr-2 h-4 w-4" />
                  {isImporting ? "Importing..." : `Import ${totalRows} Row${totalRows !== 1 ? "s" : ""}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
