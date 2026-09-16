<!--
  Purpose: The app's single light source
  Context: One fixed, static gradient behind everything. Depth without the
           drifting-blob treatment — nothing here moves or randomises.
-->

<div class="bg-ink-950 pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
	<div
		class="bg-accent-500/20 absolute -top-[20rem] left-1/2 h-[44rem] w-[72rem] -translate-x-1/2
			rounded-full blur-[130px]"
	></div>
	<div
		class="bg-signal/6 absolute -right-[18rem] -bottom-[24rem] h-[38rem] w-[52rem]
			rounded-full blur-[150px]"
	></div>

	<!-- A faint grid, clipped to the top, so the surface reads as a made thing -->
	<div
		class="absolute inset-x-0 top-0 h-[32rem] [mask-image:radial-gradient(60rem_22rem_at_50%_0%,#000,transparent)]
			opacity-[0.16]"
		style="background-image:
			linear-gradient(to right, rgb(255 255 255 / 0.06) 1px, transparent 1px),
			linear-gradient(to bottom, rgb(255 255 255 / 0.06) 1px, transparent 1px);
			background-size: 56px 56px;"
	></div>
</div>
