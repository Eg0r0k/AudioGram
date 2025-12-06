<template>
  <Scrollable direction="vertical" class="p-2 flex-1">
    <Dialog>
      <DialogTrigger as-child>
        <Button variant="ghost-primary"> PIRMAY GHOST </Button>
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
            <Button variant="ghost-primary"> Cancel </Button>
          </DialogClose>
          <Button variant="destructive-link"> Save changes </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Badge variant="destructive"> +23 </Badge>
    <Badge variant="secondary"> +23 </Badge>
    <Badge variant="outline"> +23 </Badge>
    <Badge> 2 </Badge>
    <MusicRow v-for="i in 100" :key="i" />
  </Scrollable>
</template>

<script setup lang="ts">
import MusicRow from "@/components/music/MusicRow.vue";
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
</script>
