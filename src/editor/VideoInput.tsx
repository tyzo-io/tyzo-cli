import React from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useApiClient, useAssets, useUploadAsset } from "./useApi";
import { VideoType } from "../content";
import { Link, Upload, Video, Search } from "lucide-react";
import { useDebouncedValue } from "./utils";

export const VideoInput = React.forwardRef<
  HTMLInputElement,
  {
    value: VideoType | undefined;
    onChange: (value: VideoType) => void;
  }
>(({ value, onChange }, ref) => {
  const apiClient = useApiClient();
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const { data: assets } = useAssets({
    search: debouncedSearch,
    enabled: isOpen
  });
  const uploadAsset = useUploadAsset();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          ref={ref}
          type="text"
          value={value?.src || ""}
          disabled={Boolean(value?.key)}
          onChange={(e) => onChange({ ...value, src: e.target.value })}
          placeholder="Video URL"
        />
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" type="button">
              Browse
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-screen overflow-y-scroll">
            <DialogHeader>
              <DialogTitle>Select Video</DialogTitle>
            </DialogHeader>
            <Tabs defaultValue="url">
              <TabsList>
                <TabsTrigger value="url">
                  <Link className="w-4 h-4 mr-2" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="assets">
                  <Video className="w-4 h-4 mr-2" />
                  Assets
                </TabsTrigger>
                <TabsTrigger value="upload">
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-4">
                <Input
                  type="url"
                  value={value?.src || ""}
                  onChange={(e) =>
                    onChange({ ...value, key: undefined, src: e.target.value })
                  }
                  placeholder="Enter video URL"
                />
              </TabsContent>
              <TabsContent value="assets" className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search videos..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {assets?.assets
                    ?.filter((asset) =>
                      asset.httpMetadata?.contentType?.startsWith("video/")
                    )
                    .map((asset) => (
                      <div
                        key={asset.key}
                        className="relative group cursor-pointer aspect-video rounded-lg overflow-hidden border hover:border-primary bg-muted transition-colors"
                        onClick={() => {
                          onChange({
                            ...value,
                            key: asset.key,
                            src: apiClient.getAssetUrl(asset.key),
                          });
                          setIsOpen(false);
                        }}
                      >
                        <video
                          src={apiClient.getAssetUrl(asset.key)}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Video className="w-8 h-8 text-white" />
                        </div>
                      </div>
                    ))}
                  {assets?.assets?.filter((asset) =>
                    asset.httpMetadata?.contentType?.startsWith("video/")
                  ).length === 0 && (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      No videos found
                    </div>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="upload" className="space-y-4">
                <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8">
                  <Upload className="w-8 h-8 mb-4 text-muted-foreground" />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select File
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="video/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const asset = await uploadAsset.mutate(file);
                        onChange({
                          ...value,
                          key: asset.key,
                          src: apiClient.getAssetUrl(asset.key),
                        });
                        setIsOpen(false);
                      }
                    }}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>
      {value?.src && (
        <div className="relative aspect-video w-full rounded-lg overflow-hidden border bg-muted">
          <video src={value.src} controls className="w-full h-full" />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Input
          type="text"
          value={value?.alt || ""}
          onChange={(e) => onChange({ ...value!, alt: e.target.value })}
          placeholder="Alt text (optional)"
        />
        <Input
          type="number"
          value={value?.width || ""}
          onChange={(e) =>
            onChange({
              ...value!,
              width: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          placeholder="Width (optional)"
        />
        <Input
          type="number"
          value={value?.height || ""}
          onChange={(e) =>
            onChange({
              ...value!,
              height: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          placeholder="Height (optional)"
        />
      </div>
    </div>
  );
});

VideoInput.displayName = "VideoInput";
