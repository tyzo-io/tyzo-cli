import React, { useState, useRef } from "react";
import { useAssets, useUploadAsset, useDeleteAsset } from "./useApi";
import { cn } from "./utils";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import {
  FileIcon,
  ImageIcon,
  VideoIcon,
  FileTextIcon,
  FileCodeIcon,
  AudioLines,
  FolderArchive,
  Upload,
  Loader2,
  Trash2,
  Copy,
  Info,
} from "lucide-react";
import { makeAssetUrl } from "../content";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Asset } from "../types";

function getFileType(contentType: string | undefined) {
  if (!contentType) return "unknown";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("text/")) return "text";
  if (contentType.includes("javascript") || contentType.includes("json"))
    return "code";
  if (contentType.includes("zip") || contentType.includes("compressed"))
    return "archive";
  return "other";
}

function getFileIcon(type: string) {
  switch (type) {
    case "image":
      return ImageIcon;
    case "video":
      return VideoIcon;
    case "audio":
      return AudioLines;
    case "text":
      return FileTextIcon;
    case "code":
      return FileCodeIcon;
    case "archive":
      return FolderArchive;
    default:
      return FileIcon;
  }
}

function formatFileSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export const AssetsList = ({ linkPrefix }: { linkPrefix?: string }) => {
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [urlParams, setUrlParams] = useState({
    width: "",
    height: "",
    format: "original",
    quality: "80",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, loading: assetsLoading, refetch } = useAssets();
  const { mutate: uploadAsset, loading: uploading } = useUploadAsset();
  const { mutate: deleteAsset, loading: deleting } = useDeleteAsset();
  const assets = data?.assets;

  if (assetsLoading) return <div>Loading...</div>;

  const handleDelete = async (key: string) => {
    try {
      await deleteAsset(key);
      refetch();
      setItemToDelete(null);
    } catch (error) {
      console.error("Failed to delete asset:", error);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadAsset(file);
      refetch();
      e.target.value = ''; // Reset the input
    } catch (error) {
      console.error('Failed to upload file:', error);
    }
  };

  if (!assets?.length && !uploading) {
    return (
      <div className="p-4">
        <div className="flex flex-row items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Assets</h1>
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploading ? "Uploading..." : "Upload File"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        <div className="text-center mt-8">
          <p className="mb-4">No assets found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex flex-row items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Assets</h1>
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Upload className="w-4 h-4 mr-2" />
          )}
          {uploading ? "Uploading..." : "Upload File"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {assets?.map((asset) => {
          const fileType = getFileType(asset.httpMetadata?.contentType);
          const Icon = getFileIcon(fileType);

          return (
            <Card
              key={asset.key}
              className="p-4 flex flex-col gap-2 group hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => setSelectedAsset(asset)}
            >
              <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center relative">
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setItemToDelete(asset.key);
                  }}
                  disabled={deleting}
                >
                  {deleting && itemToDelete === asset.key ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAsset(asset);
                  }}
                >
                  <Info className="h-4 w-4" />
                </Button>
                {fileType === "image" ? (
                  <img
                    src={makeAssetUrl(asset.key, { width: 200, height: 200 })}
                    alt={asset.name}
                    className="w-full h-full object-cover"
                  />
                ) : fileType === "video" ? (
                  <video
                    src={asset.key}
                    className="w-full h-full object-cover"
                    controls
                  />
                ) : fileType === "audio" ? (
                  <>
                    <Icon className="w-12 h-12 text-gray-400" />
                    <audio
                      src={asset.name}
                      controls
                      className="absolute bottom-0 w-full"
                    />
                  </>
                ) : (
                  <Icon className="w-12 h-12 text-gray-400" />
                )}
              </div>
              <div className="flex flex-col gap-1">
                <div className="font-medium truncate" title={asset.name}>
                  {asset.name}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(asset.size)}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selectedAsset} onOpenChange={() => setSelectedAsset(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Asset Information</DialogTitle>
            <DialogDescription>
              Details and URL options for {selectedAsset?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Asset Details</Label>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Name:</div>
                <div>{selectedAsset?.name}</div>
                <div>Size:</div>
                <div>{formatFileSize(selectedAsset?.size ?? 0)}</div>
                <div>Type:</div>
                <div>{selectedAsset?.httpMetadata?.contentType}</div>
                <div>Key:</div>
                <div>{selectedAsset?.key}</div>
              </div>
            </div>

            {selectedAsset && getFileType(selectedAsset.httpMetadata?.contentType) === "image" && (
              <>
                <div className="grid gap-2">
                  <Label>Image Options</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Width</Label>
                      <Input
                        type="number"
                        placeholder="Auto"
                        value={urlParams.width}
                        onChange={(e) =>
                          setUrlParams({ ...urlParams, width: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Height</Label>
                      <Input
                        type="number"
                        placeholder="Auto"
                        value={urlParams.height}
                        onChange={(e) =>
                          setUrlParams({ ...urlParams, height: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Format</Label>
                      <Select
                        value={urlParams.format}
                        onValueChange={(value) =>
                          setUrlParams({ ...urlParams, format: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="original">Original</SelectItem>
                          <SelectItem value="webp">WebP</SelectItem>
                          <SelectItem value="jpeg">JPEG</SelectItem>
                          <SelectItem value="png">PNG</SelectItem>
                          <SelectItem value="avif">AVIF</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Quality</Label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={urlParams.quality}
                        onChange={(e) =>
                          setUrlParams({ ...urlParams, quality: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Generated URL</Label>
                  <div className="relative">
                    <Input
                      readOnly
                      value={
                        selectedAsset
                          ? makeAssetUrl(selectedAsset.key, {
                              width: urlParams.width ? Number(urlParams.width) : undefined,
                              height: urlParams.height ? Number(urlParams.height) : undefined,
                              format:
                                urlParams.format !== "original"
                                  ? (urlParams.format as "webp" | "jpeg" | "png" | "avif")
                                  : undefined,
                              quality: Number(urlParams.quality),
                            })
                          : ""
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1"
                      onClick={() => {
                        if (!selectedAsset) return;
                        navigator.clipboard.writeText(
                          makeAssetUrl(selectedAsset.key, {
                            width: urlParams.width ? Number(urlParams.width) : undefined,
                            height: urlParams.height ? Number(urlParams.height) : undefined,
                            format:
                              urlParams.format !== "original"
                                ? (urlParams.format as "webp" | "jpeg" | "png" | "avif")
                                : undefined,
                            quality: Number(urlParams.quality),
                          })
                        );
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}

            {selectedAsset && getFileType(selectedAsset.httpMetadata?.contentType) !== "image" && (
              <div className="space-y-2">
                <Label>Asset URL</Label>
                <div className="relative">
                  <Input
                    readOnly
                    value={selectedAsset ? makeAssetUrl(selectedAsset.key) : ""}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1"
                    onClick={() => {
                      if (!selectedAsset) return;
                      navigator.clipboard.writeText(makeAssetUrl(selectedAsset.key));
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the asset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => itemToDelete && handleDelete(itemToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};