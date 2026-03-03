defmodule Thalassaxir.Ocean.Particle do
  @moduledoc """
  A GenServer representing a ship in the ocean.
  Each ship is a live Elixir process with its own state.
  Ships can attack each other and be repaired by the supervisor.
  """
  use GenServer

  alias Phoenix.PubSub
  alias Thalassaxir.Ocean.ParticleSupervisor

  @pubsub Thalassaxir.PubSub
  @topic "ocean:particles"

  # Ocean bounds for random positioning
  @ocean_bounds %{
    x: {-50, 50},
    y: {-20, 20},
    z: {-50, 50}
  }

  # White
  @colors ["#ffffff"]

  defstruct [:id, :position, :velocity, :color, :created_at, :heading]

  # --- Public API ---

  def start_link(opts \\ []) do
    id = Keyword.get(opts, :id, generate_id())
    GenServer.start_link(__MODULE__, opts, name: via_tuple(id))
  end

  def get_state(id) do
    GenServer.call(via_tuple(id), :get_state)
  catch
    :exit, _ -> {:error, :not_found}
  end

  def kill(id) do
    GenServer.stop(via_tuple(id), :normal)
  catch
    :exit, _ -> {:error, :not_found}
  end

  @doc """
  Crash a particle abnormally - supervisor will restart it.
  """
  def crash(id) do
    GenServer.cast(via_tuple(id), :crash)
  catch
    :exit, _ -> {:error, :not_found}
  end

  @doc """
  Storm damages a particle - lighthouse will repair it.
  """
  def storm(id) do
    GenServer.cast(via_tuple(id), :storm)
  catch
    :exit, _ -> {:error, :not_found}
  end

  def via_tuple(id) do
    {:via, Registry, {Thalassaxir.Ocean.ParticleRegistry, id}}
  end

  # --- GenServer Callbacks ---

  @impl true
  def init(opts) do
    id = Keyword.get(opts, :id, generate_id())
    position = Keyword.get(opts, :position, random_position())
    color = Keyword.get(opts, :color, random_color())
    is_repair = Keyword.get(opts, :is_repair, false)

    state = %__MODULE__{
      id: id,
      position: position,
      velocity: %{x: 0.0, y: 0.0, z: 0.0},
      color: color,
      created_at: DateTime.utc_now(),
      heading: :rand.uniform() * :math.pi() * 2
    }

    # Broadcast appropriate event
    if is_repair do
      PubSub.broadcast(@pubsub, @topic, {:particle_repairing, to_map(state)})
    else
      PubSub.broadcast(@pubsub, @topic, {:particle_spawned, to_map(state)})
    end

    {:ok, state}
  end

  @impl true
  def handle_call(:get_state, _from, state) do
    {:reply, {:ok, to_map(state)}, state}
  end

  @impl true
  def handle_call(:get_position, _from, state) do
    {:reply, {:ok, state.position}, state}
  end

  @impl true
  def handle_cast(:crash, state) do
    # Record position for repair animation
    ParticleSupervisor.record_crash(state.id, state.position, state.color)

    # Broadcast the crash event
    PubSub.broadcast(
      @pubsub,
      @topic,
      {:particle_died,
       %{
         id: state.id,
         reason: :crashed,
         position: state.position
       }}
    )

    # Stop with abnormal reason so supervisor restarts us (NOT :shutdown)
    {:stop, :crashed, state}
  end

  @impl true
  def handle_cast(:storm, state) do
    # Storm damages a particle - lighthouse will repair it (doesn't die)
    PubSub.broadcast(
      @pubsub,
      @topic,
      {:particle_stormed,
       %{
         id: state.id,
         position: state.position
       }}
    )

    # Particle stays alive, just damaged - no restart needed
    {:noreply, state}
  end

  @impl true
  def terminate(:normal, state) do
    PubSub.broadcast(@pubsub, @topic, {:particle_died, %{id: state.id, reason: :killed}})
    :ok
  end

  @impl true
  def terminate(:shutdown, state) do
    # Supervisor termination (kill_all, etc)
    PubSub.broadcast(@pubsub, @topic, {:particle_died, %{id: state.id, reason: :killed}})
    :ok
  end

  @impl true
  def terminate({:shutdown, _}, state) do
    # Supervisor termination with reason
    PubSub.broadcast(@pubsub, @topic, {:particle_died, %{id: state.id, reason: :killed}})
    :ok
  end

  @impl true
  def terminate(_reason, _state) do
    # Crashes - don't broadcast here, already handled in handle_cast(:crash)
    :ok
  end

  # --- Private Helpers ---

  defp generate_id do
    :crypto.strong_rand_bytes(8) |> Base.encode16(case: :lower)
  end

  defp random_position do
    {min_x, max_x} = @ocean_bounds.x
    {min_y, max_y} = @ocean_bounds.y
    {min_z, max_z} = @ocean_bounds.z

    %{
      x: random_float(min_x, max_x),
      y: random_float(min_y, max_y),
      z: random_float(min_z, max_z)
    }
  end

  defp random_float(min, max) do
    min + :rand.uniform() * (max - min)
  end

  defp random_color do
    Enum.random(@colors)
  end

  defp to_map(%__MODULE__{} = state) do
    %{
      id: state.id,
      position: state.position,
      color: state.color,
      heading: state.heading,
      pid: inspect(self()),
      uptime_ms: DateTime.diff(DateTime.utc_now(), state.created_at, :millisecond)
    }
  end
end
