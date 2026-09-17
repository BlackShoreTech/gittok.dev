<!--
  Purpose: The decorative spark that plays around the rail's star button on a star
  Context: Purely presentational — no state, no props. Mounted only while a
           star (never unstar) celebration is active and keyed by the caller,
           so a fresh mount is exactly one clean play of the animation. The
           parent unmounts this instantly on failure/unstar, which kills the
           CSS animations mid-flight with no residue.
-->

<script lang="ts">
	// Angle in degrees, travel distance in px, dot size in px, stagger in ms.
	// Six is enough to read as a spark, not a confetti burst.
	const PARTICLES = [
		{ angle: -95, distance: 24, size: 3, delay: 0 },
		{ angle: -25, distance: 20, size: 2, delay: 35 },
		{ angle: 40, distance: 26, size: 2.5, delay: 10 },
		{ angle: 105, distance: 22, size: 2, delay: 50 },
		{ angle: 165, distance: 25, size: 3, delay: 20 },
		{ angle: 235, distance: 21, size: 2.5, delay: 45 }
	];
</script>

<div class="star-spark-overlay absolute inset-0" aria-hidden="true">
	<span class="star-spark-ring"></span>
	{#each PARTICLES as particle, i (i)}
		<span
			class="star-spark-particle"
			style="--angle: {particle.angle}deg; --distance: {particle.distance}px; --delay: {particle.delay}ms;
				width: {particle.size}px; height: {particle.size}px;"
		></span>
	{/each}
</div>
