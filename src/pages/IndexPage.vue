<template>
  <Scrollable
    direction="vertical"
    class="p-2 flex-1"
  >
    <Skeleton class="w-40 h-5" />

    <Dialog>
      <DialogTrigger as-child>
        <Button variant="ghost-primary">
          PIRMAY GHOST
        </Button>
      </DialogTrigger>
      <DialogContent class="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose as-child>
            <Button variant="ghost-primary">
              Cancel
            </Button>
          </DialogClose>
          <Button variant="destructive-link">
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Badge variant="destructive">
      +23
    </Badge>
    <Badge variant="secondary">
      +23
    </Badge>
    <Badge variant="outline">
      +23
    </Badge>
    <Badge>2</Badge>

    <TrackContextMenu
      v-for="track in mockTracks"
      :key="track.id"
      :track="track"
      context="default"
    >
      <TrackRow :track="track" />
    </TrackContextMenu>
  </Scrollable>
</template>

<script setup lang="ts">
import Badge from "@/components/ui/badge/Badge.vue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import DialogDescription from "@/components/ui/dialog/DialogDescription.vue";
import DialogHeader from "@/components/ui/dialog/DialogHeader.vue";
import DialogTitle from "@/components/ui/dialog/DialogTitle.vue";
import Scrollable from "@/components/ui/scrollable/Scrollable.vue";
import Skeleton from "@/components/ui/skeleton/Skeleton.vue";
import TrackRow from "@/components/track/TrackRow.vue";
import TrackContextMenu from "@/components/track/context-menu/TrackContextMenu.vue";
import type { Track } from "@/types/track/track";

// Тестовые данные
const mockTracks: Track[] = [
  {
    id: "1",
    title: "Blinding Lights",
    artist: "The Weeknd",
    artistId: "artist-1",
    albumId: "album-1",
    albumName: "After Hours",
    cover: "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36",
    duration: 203,
    isLiked: true,
  },
  {
    id: "2",
    title: "Starboy",
    artist: "The Weeknd",
    artistId: "artist-1",
    albumId: "album-2",
    albumName: "Starboy",
    cover: "https://i.scdn.co/image/ab67616d0000b273a048415db06a5b6fa7ec4e1a",
    duration: 230,
    isLiked: false,
  },
  {
    id: "3",
    title: "Save Your Tears",
    artist: "The Weeknd",
    artistId: "artist-1",
    albumId: "album-1",
    albumName: "After Hours",
    cover: "https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36",
    duration: 215,
    isLiked: true,
  },
  {
    id: "4",
    title: "Levitating",
    artist: "Dua Lipa",
    artistId: "artist-2",
    albumId: "album-3",
    albumName: "Future Nostalgia",
    cover: "https://i.scdn.co/image/ab67616d0000b273bd26ede1ae69327010d49946",
    duration: 203,
    isLiked: false,
  },
  {
    id: "5",
    title: "Don't Start Now",
    artist: "Dua Lipa",
    artistId: "artist-2",
    albumId: "album-3",
    albumName: "Future Nostalgia",
    cover: "https://i.scdn.co/image/ab67616d0000b273bd26ede1ae69327010d49946",
    duration: 183,
    isLiked: true,
  },
  {
    id: "6",
    title: "Peaches",
    artist: "Justin Bieber",
    artistId: "artist-3",
    albumId: "album-4",
    albumName: "Justice",
    cover: "https://i.scdn.co/image/ab67616d0000b273e6f407c7f3a0ec98845e4431",
    duration: 198,
    isLiked: false,
  },
  {
    id: "7",
    title: "Stay",
    artist: "The Kid LAROI, Justin Bieber",
    artistId: "artist-4",
    albumId: "album-5",
    albumName: "F*CK LOVE 3: OVER YOU",
    cover: "https://i.scdn.co/image/ab67616d0000b273a91b75c9ef6f3a4f9e0f0a0d",
    duration: 141,
    isLiked: true,
  },
  {
    id: "8",
    title: "good 4 u",
    artist: "Olivia Rodrigo",
    artistId: "artist-5",
    albumId: "album-6",
    albumName: "SOUR",
    cover: "https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802e5a",
    duration: 178,
    isLiked: false,
  },
];
</script>
